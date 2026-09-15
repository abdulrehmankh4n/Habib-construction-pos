import express, { Router } from 'express';
import { z } from 'zod';
import { roundQty, type Paginated, type Product, type StockMovement } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, tx, type DB } from '../db';
import { actorOf, can, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, conflict, notFound } from '../lib/errors';
import { idParam, pagination, parse, queryBool, queryInt, queryString, zs } from '../lib/http';
import { nowLocal } from '../lib/time';
import { escapeLike, getProduct, hydrateProducts, PRODUCT_SELECT, type ProductRow } from '../services/products';
import { deleteProductImage, productImagePath, removeFile, saveProductImage } from '../services/images';
import { applyStockChange } from '../services/stock';

const unitRowSchema = z.object({
  unitId: zs.id,
  factor: z.coerce.number().positive('Conversion factor must be greater than zero').max(1e7),
  salePrice: zs.optMoney,
  wholesalePrice: zs.optMoney,
  barcode: zs.text(60),
});

const productSchema = z.object({
  sku: zs.text(40),
  barcode: zs.text(60),
  name: zs.name(160),
  urduName: zs.text(160),
  categoryId: zs.id,
  subcategoryId: zs.optId,
  brandId: zs.optId,
  specification: zs.text(120),
  size: zs.text(60),
  unitId: zs.id,
  purchasePrice: zs.money.default(0),
  salePrice: zs.money,
  wholesalePrice: zs.optMoney,
  minSalePrice: zs.optMoney,
  minStock: z.coerce.number().min(0).max(1e9).default(0),
  supplierId: zs.optId,
  taxRateId: zs.id,
  hsCode: zs.text(20),
  location: zs.text(60),
  trackStock: z.boolean().default(true),
  notes: zs.text(1000),
  isActive: z.boolean().default(true),
  units: z.array(unitRowSchema).max(10).default([]),
});

const createSchema = productSchema.extend({
  openingStock: z.coerce.number().min(0).max(1e9).default(0),
});

type ProductInput = z.infer<typeof productSchema>;

function categoryCode(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'PRD').padEnd(3, 'X');
}

function generateSku(db: DB, categoryId: number): string {
  const cat = one<{ name: string }>(db, 'SELECT name FROM categories WHERE id = ?', [categoryId]);
  const code = categoryCode(cat?.name ?? 'PRD');
  let n = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM products WHERE category_id = ?', [categoryId])!.n + 1;
  for (;;) {
    const sku = `${code}-${String(n).padStart(4, '0')}`;
    if (!one(db, 'SELECT id FROM products WHERE sku = ?', [sku])) return sku;
    n++;
  }
}

function validateReferences(db: DB, input: ProductInput, productId: number | null) {
  if (!one(db, 'SELECT id FROM categories WHERE id = ?', [input.categoryId])) throw badRequest('Category not found');
  if (input.subcategoryId) {
    const sub = one<{ category_id: number }>(db, 'SELECT category_id FROM subcategories WHERE id = ?', [
      input.subcategoryId,
    ]);
    if (!sub) throw badRequest('Subcategory not found');
    if (sub.category_id !== input.categoryId) throw badRequest('Subcategory does not belong to the selected category');
  }
  if (input.brandId && !one(db, 'SELECT id FROM brands WHERE id = ?', [input.brandId])) {
    throw badRequest('Brand not found');
  }
  if (!one(db, 'SELECT id FROM units WHERE id = ?', [input.unitId])) throw badRequest('Unit not found');
  if (!one(db, 'SELECT id FROM tax_rates WHERE id = ?', [input.taxRateId])) throw badRequest('Tax rate not found');
  if (input.supplierId && !one(db, 'SELECT id FROM suppliers WHERE id = ?', [input.supplierId])) {
    throw badRequest('Supplier not found');
  }
  if (input.minSalePrice !== null && input.minSalePrice !== undefined && input.minSalePrice > input.salePrice) {
    throw badRequest('Minimum sale price cannot be higher than the sale price');
  }

  const seenUnits = new Set<number>();
  const barcodes = new Set<string>();
  if (input.barcode) barcodes.add(input.barcode.toLowerCase());
  for (const u of input.units) {
    if (u.unitId === input.unitId) throw badRequest('An alternate unit cannot be the same as the base unit');
    if (seenUnits.has(u.unitId)) throw badRequest('Each alternate unit can only be added once');
    seenUnits.add(u.unitId);
    if (!one(db, 'SELECT id FROM units WHERE id = ?', [u.unitId])) throw badRequest('Alternate unit not found');
    if (u.barcode) {
      const key = u.barcode.toLowerCase();
      if (barcodes.has(key)) throw badRequest(`Barcode ${u.barcode} is used more than once`);
      barcodes.add(key);
    }
  }

  for (const code of barcodes) {
    const clash =
      one<{ id: number }>(db, 'SELECT id FROM products WHERE lower(barcode) = ? AND id != ?', [code, productId ?? 0]) ??
      one<{ id: number }>(db, 'SELECT product_id AS id FROM product_units WHERE lower(barcode) = ? AND product_id != ?', [
        code,
        productId ?? 0,
      ]);
    if (clash) throw conflict(`Barcode ${code} is already assigned to another product`);
  }
}

function saveUnits(db: DB, productId: number, units: ProductInput['units']) {
  run(db, 'DELETE FROM product_units WHERE product_id = ?', [productId]);
  for (const u of units) {
    run(
      db,
      `INSERT INTO product_units (product_id, unit_id, factor, sale_price, wholesale_price, barcode)
       VALUES (@productId, @unitId, @factor, @salePrice, @wholesalePrice, @barcode)`,
      { productId, ...u },
    );
  }
}

export function productRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  router.get('/', requirePermission('products.view', 'pos.sell'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query, 500);
    const search = queryString(req.query, 'search');
    const categoryId = queryInt(req.query, 'categoryId');
    const subcategoryId = queryInt(req.query, 'subcategoryId');
    const brandId = queryInt(req.query, 'brandId');
    const supplierId = queryInt(req.query, 'supplierId');
    const lowStock = queryBool(req.query, 'lowStock') ?? false;
    const includeInactive = queryBool(req.query, 'includeInactive') ?? false;
    const sort = queryString(req.query, 'sort') ?? 'name';

    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (!includeInactive) where.push('p.is_active = 1');
    if (categoryId) {
      where.push('p.category_id = @categoryId');
      params.categoryId = categoryId;
    }
    if (subcategoryId) {
      where.push('p.subcategory_id = @subcategoryId');
      params.subcategoryId = subcategoryId;
    }
    if (brandId) {
      where.push('p.brand_id = @brandId');
      params.brandId = brandId;
    }
    if (supplierId) {
      where.push('p.supplier_id = @supplierId');
      params.supplierId = supplierId;
    }
    if (lowStock) where.push('p.track_stock = 1 AND p.stock_qty <= p.min_stock');
    if (search) {
      search
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6)
        .forEach((term, i) => {
          const key = `t${i}`;
          params[key] = `%${escapeLike(term)}%`;
          where.push(
            `(p.name LIKE @${key} ESCAPE '\\' OR p.sku LIKE @${key} ESCAPE '\\' OR p.barcode LIKE @${key} ESCAPE '\\'
              OR p.urdu_name LIKE @${key} ESCAPE '\\' OR p.size LIKE @${key} ESCAPE '\\'
              OR p.specification LIKE @${key} ESCAPE '\\' OR b.name LIKE @${key} ESCAPE '\\'
              OR sc.name LIKE @${key} ESCAPE '\\' OR c.name LIKE @${key} ESCAPE '\\')`,
          );
        });
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderBy =
      {
        name: 'p.name COLLATE NOCASE ASC',
        stock: 'p.stock_qty ASC',
        updated: 'p.updated_at DESC',
        sku: 'p.sku ASC',
      }[sort] ?? 'p.name COLLATE NOCASE ASC';

    const total = one<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
       LEFT JOIN brands b ON b.id = p.brand_id ${whereSql}`,
      params,
    )!.n;
    const rows = all<ProductRow>(
      db,
      `${PRODUCT_SELECT} ${whereSql} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`,
      { ...params, limit: pageSize, offset },
    );
    const body: Paginated<Product> = {
      data: hydrateProducts(db, rows, can(req, 'products.view_cost')),
      total,
      page,
      pageSize,
    };
    res.json(body);
  });

  router.get('/lookup', requirePermission('products.view', 'pos.sell'), (req, res) => {
    const code = queryString(req.query, 'code');
    if (!code) throw badRequest('code is required');
    const direct = one<{ id: number }>(
      db,
      'SELECT id FROM products WHERE is_active = 1 AND (lower(barcode) = lower(@code) OR lower(sku) = lower(@code))',
      { code },
    );
    if (direct) {
      const product = getProduct(db, direct.id, can(req, 'products.view_cost'));
      res.json({ product, unitId: product.unitId });
      return;
    }
    const alt = one<{ product_id: number; unit_id: number }>(
      db,
      `SELECT pu.product_id, pu.unit_id FROM product_units pu JOIN products p ON p.id = pu.product_id
       WHERE p.is_active = 1 AND lower(pu.barcode) = lower(?)`,
      [code],
    );
    if (!alt) throw notFound('Product with this code');
    res.json({ product: getProduct(db, alt.product_id, can(req, 'products.view_cost')), unitId: alt.unit_id });
  });

  router.get('/:id', requirePermission('products.view', 'pos.sell'), (req, res) => {
    res.json(getProduct(db, idParam(req), can(req, 'products.view_cost')));
  });

  router.get('/:id/image', requirePermission('products.view', 'pos.sell'), (req, res) => {
    const file = productImagePath(ctx, idParam(req));
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(file);
  });

  router.put(
    '/:id/image',
    requirePermission('products.manage'),
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '4mb' }),
    (req, res) => {
      const id = idParam(req);
      saveProductImage(ctx, id, req.body);
      audit(db, actorOf(req), 'product.image_upload', 'product', id);
      res.json(getProduct(db, id, can(req, 'products.view_cost')));
    },
  );

  router.delete('/:id/image', requirePermission('products.manage'), (req, res) => {
    const id = idParam(req);
    deleteProductImage(ctx, id);
    audit(db, actorOf(req), 'product.image_delete', 'product', id);
    res.json(getProduct(db, id, can(req, 'products.view_cost')));
  });

  router.get('/:id/movements', requirePermission('products.view'), (req, res) => {
    const id = idParam(req);
    const { page, pageSize, offset } = pagination(req.query);
    const total = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM stock_movements WHERE product_id = ?', [id])!.n;
    const rows = all<StockMovement>(
      db,
      `SELECT m.id, m.product_id AS productId, m.movement_type AS movementType, m.qty_change AS qtyChange,
         m.balance_after AS balanceAfter, m.unit_cost AS unitCost, m.reference_type AS referenceType,
         m.reference_id AS referenceId, m.reference_no AS referenceNo, m.note, u.full_name AS createdByName,
         m.created_at AS createdAt
       FROM stock_movements m LEFT JOIN users u ON u.id = m.created_by
       WHERE m.product_id = @id ORDER BY m.id DESC LIMIT @limit OFFSET @offset`,
      { id, limit: pageSize, offset },
    );
    const showCost = can(req, 'products.view_cost');
    const data = rows.map((r) => {
      if (!showCost) delete r.unitCost;
      return r;
    });
    res.json({ data, total, page, pageSize } satisfies Paginated<StockMovement>);
  });

  router.post('/', requirePermission('products.manage'), (req, res) => {
    const body = parse(createSchema, req.body);
    const actor = actorOf(req);
    const id = tx(db, () => {
      validateReferences(db, body, null);
      const sku = body.sku ?? generateSku(db, body.categoryId);
      const now = nowLocal();
      const r = run(
        db,
        `INSERT INTO products (sku, barcode, name, urdu_name, category_id, subcategory_id, brand_id, specification, size,
           unit_id, purchase_price, cost_price, sale_price, wholesale_price, min_sale_price, stock_qty, min_stock,
           supplier_id, tax_rate_id, hs_code, location, track_stock, notes, is_active, created_at, updated_at)
         VALUES (@sku, @barcode, @name, @urduName, @categoryId, @subcategoryId, @brandId, @specification, @size,
           @unitId, @purchasePrice, @purchasePrice, @salePrice, @wholesalePrice, @minSalePrice, 0, @minStock,
           @supplierId, @taxRateId, @hsCode, @location, @trackStock, @notes, @isActive, @now, @now)`,
        { ...body, sku, now },
      );
      const productId = Number(r.lastInsertRowid);
      saveUnits(db, productId, body.units);
      if (body.openingStock > 0) {
        applyStockChange(db, {
          productId,
          qtyChange: roundQty(body.openingStock),
          type: 'opening',
          unitCost: body.purchasePrice,
          note: 'Opening stock',
          userId: actor.id,
          at: now,
        });
      }
      audit(db, actor, 'product.create', 'product', productId, { sku, name: body.name });
      return productId;
    });
    res.status(201).json(getProduct(db, id, can(req, 'products.view_cost')));
  });

  router.put('/:id', requirePermission('products.manage'), (req, res) => {
    const id = idParam(req);
    const body = parse(productSchema, req.body);
    const actor = actorOf(req);
    tx(db, () => {
      const existing = one<{ sku: string; sale_price: number; purchase_price: number; unit_id: number }>(
        db,
        'SELECT sku, sale_price, purchase_price, unit_id FROM products WHERE id = ?',
        [id],
      );
      if (!existing) throw notFound('Product');
      if (existing.unit_id !== body.unitId && one(db, 'SELECT 1 FROM stock_movements WHERE product_id = ? LIMIT 1', [id])) {
        throw badRequest('The base unit cannot be changed after stock has been recorded for this product');
      }
      validateReferences(db, body, id);
      const canCost = can(req, 'products.view_cost');
      run(
        db,
        `UPDATE products SET sku = @sku, barcode = @barcode, name = @name, urdu_name = @urduName,
           category_id = @categoryId, subcategory_id = @subcategoryId, brand_id = @brandId,
           specification = @specification, size = @size, unit_id = @unitId,
           purchase_price = @purchasePrice, sale_price = @salePrice, wholesale_price = @wholesalePrice,
           min_sale_price = @minSalePrice, min_stock = @minStock, supplier_id = @supplierId,
           tax_rate_id = @taxRateId, hs_code = @hsCode, location = @location, track_stock = @trackStock,
           notes = @notes, is_active = @isActive, updated_at = @now
         WHERE id = @id`,
        {
          ...body,
          sku: body.sku ?? existing.sku,
          purchasePrice: canCost ? body.purchasePrice : existing.purchase_price,
          id,
          now: nowLocal(),
        },
      );
      saveUnits(db, id, body.units);
      const changes: Record<string, unknown> = { name: body.name };
      if (existing.sale_price !== body.salePrice) changes.salePrice = { from: existing.sale_price, to: body.salePrice };
      audit(db, actor, 'product.update', 'product', id, changes);
    });
    res.json(getProduct(db, id, can(req, 'products.view_cost')));
  });

  router.delete('/:id', requirePermission('products.manage'), (req, res) => {
    const id = idParam(req);
    const image = one<{ image_file: string | null }>(db, 'SELECT image_file FROM products WHERE id = ?', [id]);
    tx(db, () => {
      const used =
        one(db, 'SELECT 1 FROM sale_items WHERE product_id = ? LIMIT 1', [id]) ??
        one(db, 'SELECT 1 FROM purchase_items WHERE product_id = ? LIMIT 1', [id]) ??
        one(db, 'SELECT 1 FROM quotation_items WHERE product_id = ? LIMIT 1', [id]);
      if (used) throw conflict('This product has transactions and cannot be deleted. Deactivate it instead.');
      run(db, 'DELETE FROM stock_movements WHERE product_id = ?', [id]);
      run(db, 'DELETE FROM stock_adjustments WHERE product_id = ?', [id]);
      const r = run(db, 'DELETE FROM products WHERE id = ?', [id]);
      if (r.changes === 0) throw notFound('Product');
      audit(db, actorOf(req), 'product.delete', 'product', id);
    });
    removeFile(ctx, image?.image_file ?? null);
    res.json({ ok: true });
  });

  return router;
}
