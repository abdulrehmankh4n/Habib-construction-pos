import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AppContext } from '../context';
import { one, run } from '../db';
import { badRequest, notFound } from '../lib/errors';
import { nowLocal } from '../lib/time';

const MAX_BYTES = 4 * 1024 * 1024;

function detectType(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

function imageDir(ctx: AppContext): string {
  const dir = path.join(ctx.config.dataDir, 'uploads', 'products');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function productImagePath(ctx: AppContext, productId: number): string {
  const row = one<{ image_file: string | null }>(ctx.db, 'SELECT image_file FROM products WHERE id = ?', [productId]);
  if (!row) throw notFound('Product');
  if (!row.image_file) throw notFound('Product image');
  const file = path.join(imageDir(ctx), path.basename(row.image_file));
  if (!fs.existsSync(file)) throw notFound('Product image');
  return file;
}

export function removeFile(ctx: AppContext, name: string | null) {
  if (!name) return;
  try {
    fs.unlinkSync(path.join(imageDir(ctx), path.basename(name)));
  } catch {
    ctx.logger.debug({ name }, 'image file already removed');
  }
}

export function saveProductImage(ctx: AppContext, productId: number, body: unknown): string {
  if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('Upload a JPG, PNG or WEBP image');
  if (body.length > MAX_BYTES) throw badRequest('Image is too large (max 4 MB)');
  const ext = detectType(body);
  if (!ext) throw badRequest('Only JPG, PNG or WEBP images are allowed');
  const row = one<{ image_file: string | null }>(ctx.db, 'SELECT image_file FROM products WHERE id = ?', [productId]);
  if (!row) throw notFound('Product');
  const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 12);
  const name = `${productId}-${hash}.${ext}`;
  fs.writeFileSync(path.join(imageDir(ctx), name), body);
  run(ctx.db, 'UPDATE products SET image_file = ?, updated_at = ? WHERE id = ?', [name, nowLocal(), productId]);
  if (row.image_file && row.image_file !== name) removeFile(ctx, row.image_file);
  return name;
}

export function deleteProductImage(ctx: AppContext, productId: number) {
  const row = one<{ image_file: string | null }>(ctx.db, 'SELECT image_file FROM products WHERE id = ?', [productId]);
  if (!row) throw notFound('Product');
  run(ctx.db, 'UPDATE products SET image_file = NULL, updated_at = ? WHERE id = ?', [nowLocal(), productId]);
  removeFile(ctx, row.image_file);
}
