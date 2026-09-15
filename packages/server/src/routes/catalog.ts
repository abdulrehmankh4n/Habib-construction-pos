import { Router } from 'express';
import { z } from 'zod';
import type { Brand, Category, Subcategory, TaxRate, Unit } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, tx } from '../db';
import { actorOf, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { conflict, notFound, unprocessable } from '../lib/errors';
import { idParam, parse, queryBool, zs } from '../lib/http';
import { nowLocal } from '../lib/time';

const categorySchema = z.object({
  name: zs.name(80),
  description: zs.text(300),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

const subcategorySchema = z.object({
  categoryId: zs.id,
  name: zs.name(80),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

const brandSchema = z.object({ name: zs.name(80), isActive: z.boolean().default(true) });

const unitSchema = z.object({
  name: zs.name(40),
  symbol: z.string().trim().min(1).max(12),
  allowDecimal: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const taxSchema = z.object({
  name: zs.name(60),
  rate: z.coerce.number().min(0).max(100),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const bool = <T extends object>(row: T, ...keys: (keyof T)[]): T => {
  const out = { ...row } as Record<keyof T, unknown>;
  for (const k of keys) out[k] = !!row[k];
  return out as T;
};

export function catalogRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;
  const manage = requirePermission('catalog.manage');

  router.get('/categories', (req, res) => {
    const includeInactive = queryBool(req.query, 'includeInactive') ?? false;
    const cats = all<Category>(
      db,
      `SELECT c.id, c.name, c.description, c.sort_order AS sortOrder, c.is_active AS isActive,
         (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS productCount
       FROM categories c WHERE (@all = 1 OR c.is_active = 1) ORDER BY c.sort_order, c.name`,
      { all: includeInactive ? 1 : 0 },
    );
    const subs = all<Subcategory>(
      db,
      `SELECT s.id, s.category_id AS categoryId, s.name, s.sort_order AS sortOrder, s.is_active AS isActive,
         (SELECT COUNT(*) FROM products p WHERE p.subcategory_id = s.id) AS productCount
       FROM subcategories s WHERE (@all = 1 OR s.is_active = 1) ORDER BY s.sort_order, s.name`,
      { all: includeInactive ? 1 : 0 },
    );
    const byCat = new Map<number, Subcategory[]>();
    for (const s of subs) {
      const list = byCat.get(s.categoryId) ?? [];
      list.push(bool(s, 'isActive'));
      byCat.set(s.categoryId, list);
    }
    res.json(cats.map((c) => ({ ...bool(c, 'isActive'), subcategories: byCat.get(c.id) ?? [] })));
  });

  router.post('/categories', manage, (req, res) => {
    const body = parse(categorySchema, req.body);
    const now = nowLocal();
    const id = tx(db, () => {
      const r = run(
        db,
        `INSERT INTO categories (name, description, sort_order, is_active, created_at, updated_at)
         VALUES (@name, @description, @sortOrder, @isActive, @now, @now)`,
        { ...body, now },
      );
      audit(db, actorOf(req), 'category.create', 'category', r.lastInsertRowid, body);
      return Number(r.lastInsertRowid);
    });
    res.status(201).json({ id });
  });

  router.put('/categories/:id', manage, (req, res) => {
    const id = idParam(req);
    const body = parse(categorySchema, req.body);
    tx(db, () => {
      const r = run(
        db,
        `UPDATE categories SET name = @name, description = @description, sort_order = @sortOrder,
           is_active = @isActive, updated_at = @now WHERE id = @id`,
        { ...body, id, now: nowLocal() },
      );
      if (r.changes === 0) throw notFound('Category');
      audit(db, actorOf(req), 'category.update', 'category', id, body);
    });
    res.json({ id });
  });

  router.delete('/categories/:id', manage, (req, res) => {
    const id = idParam(req);
    tx(db, () => {
      const used = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM products WHERE category_id = ?', [id])!.n;
      if (used > 0) throw conflict(`This category has ${used} product(s). Deactivate it instead.`);
      run(db, 'DELETE FROM subcategories WHERE category_id = ?', [id]);
      const r = run(db, 'DELETE FROM categories WHERE id = ?', [id]);
      if (r.changes === 0) throw notFound('Category');
      audit(db, actorOf(req), 'category.delete', 'category', id);
    });
    res.json({ ok: true });
  });

  router.post('/subcategories', manage, (req, res) => {
    const body = parse(subcategorySchema, req.body);
    if (!one(db, 'SELECT id FROM categories WHERE id = ?', [body.categoryId])) throw notFound('Category');
    const now = nowLocal();
    const id = tx(db, () => {
      const r = run(
        db,
        `INSERT INTO subcategories (category_id, name, sort_order, is_active, created_at, updated_at)
         VALUES (@categoryId, @name, @sortOrder, @isActive, @now, @now)`,
        { ...body, now },
      );
      audit(db, actorOf(req), 'subcategory.create', 'subcategory', r.lastInsertRowid, body);
      return Number(r.lastInsertRowid);
    });
    res.status(201).json({ id });
  });

  router.put('/subcategories/:id', manage, (req, res) => {
    const id = idParam(req);
    const body = parse(subcategorySchema, req.body);
    tx(db, () => {
      const current = one<{ category_id: number }>(db, 'SELECT category_id FROM subcategories WHERE id = ?', [id]);
      if (!current) throw notFound('Subcategory');
      if (current.category_id !== body.categoryId) {
        const used = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM products WHERE subcategory_id = ?', [id])!.n;
        if (used > 0) throw unprocessable('Cannot move a subcategory that has products to another category');
      }
      run(
        db,
        `UPDATE subcategories SET category_id = @categoryId, name = @name, sort_order = @sortOrder,
           is_active = @isActive, updated_at = @now WHERE id = @id`,
        { ...body, id, now: nowLocal() },
      );
      audit(db, actorOf(req), 'subcategory.update', 'subcategory', id, body);
    });
    res.json({ id });
  });

  router.delete('/subcategories/:id', manage, (req, res) => {
    const id = idParam(req);
    tx(db, () => {
      const used = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM products WHERE subcategory_id = ?', [id])!.n;
      if (used > 0) throw conflict(`This subcategory has ${used} product(s). Deactivate it instead.`);
      const r = run(db, 'DELETE FROM subcategories WHERE id = ?', [id]);
      if (r.changes === 0) throw notFound('Subcategory');
      audit(db, actorOf(req), 'subcategory.delete', 'subcategory', id);
    });
    res.json({ ok: true });
  });

  router.get('/brands', (req, res) => {
    const includeInactive = queryBool(req.query, 'includeInactive') ?? false;
    res.json(
      all<Brand>(
        db,
        `SELECT b.id, b.name, b.is_active AS isActive,
           (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id) AS productCount
         FROM brands b WHERE (@all = 1 OR b.is_active = 1) ORDER BY b.name`,
        { all: includeInactive ? 1 : 0 },
      ).map((b) => bool(b, 'isActive')),
    );
  });

  router.post('/brands', manage, (req, res) => {
    const body = parse(brandSchema, req.body);
    const now = nowLocal();
    const id = tx(db, () => {
      const r = run(
        db,
        'INSERT INTO brands (name, is_active, created_at, updated_at) VALUES (@name, @isActive, @now, @now)',
        { ...body, now },
      );
      audit(db, actorOf(req), 'brand.create', 'brand', r.lastInsertRowid, body);
      return Number(r.lastInsertRowid);
    });
    res.status(201).json({ id });
  });

  router.put('/brands/:id', manage, (req, res) => {
    const id = idParam(req);
    const body = parse(brandSchema, req.body);
    tx(db, () => {
      const r = run(db, 'UPDATE brands SET name = @name, is_active = @isActive, updated_at = @now WHERE id = @id', {
        ...body,
        id,
        now: nowLocal(),
      });
      if (r.changes === 0) throw notFound('Brand');
      audit(db, actorOf(req), 'brand.update', 'brand', id, body);
    });
    res.json({ id });
  });

  router.delete('/brands/:id', manage, (req, res) => {
    const id = idParam(req);
    tx(db, () => {
      const r = run(db, 'DELETE FROM brands WHERE id = ?', [id]);
      if (r.changes === 0) throw notFound('Brand');
      audit(db, actorOf(req), 'brand.delete', 'brand', id);
    });
    res.json({ ok: true });
  });

  router.get('/units', (req, res) => {
    const includeInactive = queryBool(req.query, 'includeInactive') ?? false;
    res.json(
      all<Unit>(
        db,
        `SELECT id, name, symbol, allow_decimal AS allowDecimal, is_active AS isActive
         FROM units WHERE (@all = 1 OR is_active = 1) ORDER BY name`,
        { all: includeInactive ? 1 : 0 },
      ).map((u) => bool(u, 'allowDecimal', 'isActive')),
    );
  });

  router.post('/units', manage, (req, res) => {
    const body = parse(unitSchema, req.body);
    const now = nowLocal();
    const id = tx(db, () => {
      const r = run(
        db,
        `INSERT INTO units (name, symbol, allow_decimal, is_active, created_at, updated_at)
         VALUES (@name, @symbol, @allowDecimal, @isActive, @now, @now)`,
        { ...body, now },
      );
      audit(db, actorOf(req), 'unit.create', 'unit', r.lastInsertRowid, body);
      return Number(r.lastInsertRowid);
    });
    res.status(201).json({ id });
  });

  router.put('/units/:id', manage, (req, res) => {
    const id = idParam(req);
    const body = parse(unitSchema, req.body);
    tx(db, () => {
      const r = run(
        db,
        `UPDATE units SET name = @name, symbol = @symbol, allow_decimal = @allowDecimal, is_active = @isActive,
           updated_at = @now WHERE id = @id`,
        { ...body, id, now: nowLocal() },
      );
      if (r.changes === 0) throw notFound('Unit');
      audit(db, actorOf(req), 'unit.update', 'unit', id, body);
    });
    res.json({ id });
  });

  router.delete('/units/:id', manage, (req, res) => {
    const id = idParam(req);
    tx(db, () => {
      const r = run(db, 'DELETE FROM units WHERE id = ?', [id]);
      if (r.changes === 0) throw notFound('Unit');
      audit(db, actorOf(req), 'unit.delete', 'unit', id);
    });
    res.json({ ok: true });
  });

  router.get('/tax-rates', (req, res) => {
    const includeInactive = queryBool(req.query, 'includeInactive') ?? false;
    res.json(
      all<TaxRate>(
        db,
        `SELECT id, name, rate, is_default AS isDefault, is_active AS isActive
         FROM tax_rates WHERE (@all = 1 OR is_active = 1) ORDER BY rate DESC, name`,
        { all: includeInactive ? 1 : 0 },
      ).map((t) => bool(t, 'isDefault', 'isActive')),
    );
  });

  const saveTax = (id: number | null, body: z.infer<typeof taxSchema>) => {
    const now = nowLocal();
    if (body.isDefault) {
      if (!body.isActive) throw unprocessable('The default tax rate must be active');
      run(db, 'UPDATE tax_rates SET is_default = 0');
    }
    if (id === null) {
      return Number(
        run(
          db,
          `INSERT INTO tax_rates (name, rate, is_default, is_active, created_at, updated_at)
           VALUES (@name, @rate, @isDefault, @isActive, @now, @now)`,
          { ...body, now },
        ).lastInsertRowid,
      );
    }
    const r = run(
      db,
      `UPDATE tax_rates SET name = @name, rate = @rate, is_default = @isDefault, is_active = @isActive,
         updated_at = @now WHERE id = @id`,
      { ...body, id, now },
    );
    if (r.changes === 0) throw notFound('Tax rate');
    return id;
  };

  router.post('/tax-rates', manage, (req, res) => {
    const body = parse(taxSchema, req.body);
    const id = tx(db, () => {
      const newId = saveTax(null, body);
      audit(db, actorOf(req), 'tax_rate.create', 'tax_rate', newId, body);
      return newId;
    });
    res.status(201).json({ id });
  });

  router.put('/tax-rates/:id', manage, (req, res) => {
    const id = idParam(req);
    const body = parse(taxSchema, req.body);
    tx(db, () => {
      saveTax(id, body);
      if (!one(db, 'SELECT id FROM tax_rates WHERE is_default = 1')) {
        throw unprocessable('At least one default tax rate is required');
      }
      audit(db, actorOf(req), 'tax_rate.update', 'tax_rate', id, body);
    });
    res.json({ id });
  });

  router.delete('/tax-rates/:id', manage, (req, res) => {
    const id = idParam(req);
    tx(db, () => {
      const row = one<{ is_default: number }>(db, 'SELECT is_default FROM tax_rates WHERE id = ?', [id]);
      if (!row) throw notFound('Tax rate');
      if (row.is_default) throw unprocessable('The default tax rate cannot be deleted');
      run(db, 'DELETE FROM tax_rates WHERE id = ?', [id]);
      audit(db, actorOf(req), 'tax_rate.delete', 'tax_rate', id);
    });
    res.json({ ok: true });
  });

  return router;
}
