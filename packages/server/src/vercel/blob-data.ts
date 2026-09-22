import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db';

const DB_BLOB = 'construction-pos/pos.db';
const SECRET_BLOB = 'construction-pos/jwt-secret';

function token(): string | null {
  const t = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return t || null;
}

export async function restoreDataDir(dataDir: string): Promise<void> {
  if (!token()) return;
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    const { head } = await import('@vercel/blob');
    const dbMeta = await head(DB_BLOB).catch(() => null);
    if (dbMeta?.url) {
      const res = await fetch(dbMeta.url);
      if (res.ok) fs.writeFileSync(path.join(dataDir, 'pos.db'), Buffer.from(await res.arrayBuffer()));
    }
    const secretMeta = await head(SECRET_BLOB).catch(() => null);
    if (secretMeta?.url) {
      const res = await fetch(secretMeta.url);
      if (res.ok) fs.writeFileSync(path.join(dataDir, '.jwt-secret'), Buffer.from(await res.arrayBuffer()));
    }
  } catch {
    // Blob optional — cold start uses a fresh database until Blob is linked.
  }
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

export function schedulePersistDataDir(dataDir: string, db: DB): void {
  if (!token()) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void persistDataDir(dataDir, db);
  }, 1500);
}

async function persistDataDir(dataDir: string, db: DB): Promise<void> {
  if (!token()) return;
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    const { put } = await import('@vercel/blob');
    const dbPath = path.join(dataDir, 'pos.db');
    if (fs.existsSync(dbPath)) {
      await put(DB_BLOB, fs.readFileSync(dbPath), { access: 'public', addRandomSuffix: false });
    }
    const secretPath = path.join(dataDir, '.jwt-secret');
    if (fs.existsSync(secretPath)) {
      await put(SECRET_BLOB, fs.readFileSync(secretPath), { access: 'public', addRandomSuffix: false });
    }
  } catch {
    // ignore upload failures; next request may retry
  }
}
