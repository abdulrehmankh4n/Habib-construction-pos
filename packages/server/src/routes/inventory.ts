import { Router } from 'express';
import { z } from 'zod';
import { roundQty, type Paginated, type StockAdjustment, type StockMovement } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, tx } from '../db';
import { actorOf, can, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, unprocessable } from '../lib/errors';
import { pagination, parse, queryDay, queryInt, queryString, zs } from '../lib/http';
import { nextNumber } from '../lib/sequences';
import { getSettings } from '../lib/settings';
import { addDays, nowLocal } from '../lib/time';
import { applyStockChange, getProductStock } from '../services/stock';

const adjustmentSchema = z.object({
  productId: zs.id,
  mode: z.enum(['in', 'out', 'set']),
  qty: z.coerce.number().min(0).max(1e9),
  reason: zs.name(80),
  note: zs.text(500),
});

export function inventoryRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  router.get('/adjustments', requirePermission('inventory.adjust'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const from = queryDay(req.query, 'from');
    const to = queryDay(req.query, 'to');
    const params = {
      from: from ?? null,
      to: to ? addDays(to, 1) : null,
      productId: queryInt(req.query, 'productId') ?? null,
    };
    const where = `WHERE (@from IS NULL OR a.created_at >= @from) AND (@to IS NULL OR a.created_at < @to)
      AND (@productId IS NULL OR a.product_id = @productId)`;
    const total = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM stock_adjustments a ${where}`, params)!.n;
    const data = all<StockAdjustment>(
      db,
      `SELECT a.id, a.adjustment_no AS adjustmentNo, a.product_id AS productId, p.name AS productName,
         un.symbol AS unitSymbol, a.adjustment_type AS adjustmentType, a.qty, a.reason, a.note, a.unit_cost AS unitCost,
         u.full_name AS createdByName, a.created_at AS createdAt
       FROM stock_adjustments a JOIN products p ON p.id = a.product_id JOIN units un ON un.id = p.unit_id
       LEFT JOIN users u ON u.id = a.created_by ${where} ORDER BY a.id DESC LIMIT @limit OFFSET @offset`,
      { ...params, limit: pageSize, offset },
    );
    res.json({ data, total, page, pageSize } satisfies Paginated<StockAdjustment>);
  });

  router.post('/adjustments', requirePermission('inventory.adjust'), (req, res) => {
    const body = parse(adjustmentSchema, req.body);
    const actor = actorOf(req);
    const result = tx(db, () => {
      const product = getProductStock(db, body.productId);
      let change: number;
      if (body.mode === 'set') change = roundQty(body.qty - product.stock_qty);
      else change = roundQty(body.mode === 'in' ? body.qty : -body.qty);
      if (change === 0) throw badRequest('Quantity must be greater than zero (no change to stock)');
      const settings = getSettings(db);
      const newQty = roundQty(product.stock_qty + change);
      if (newQty < 0 && !settings.sales.allowNegativeStock) {
        throw unprocessable(`Stock of ${product.name} cannot go below zero (current ${roundQty(product.stock_qty)})`);
      }
      const adjustmentNo = nextNumber(db, 'adjustment');
      const now = nowLocal();
      const r = run(
        db,
        `INSERT INTO stock_adjustments (adjustment_no, product_id, adjustment_type, qty, reason, note, unit_cost,
           created_by, created_at)
         VALUES (@adjustmentNo, @productId, @type, @qty, @reason, @note, @unitCost, @userId, @now)`,
        {
          adjustmentNo,
          productId: product.id,
          type: change > 0 ? 'in' : 'out',
          qty: Math.abs(change),
          reason: body.reason,
          note: body.note,
          unitCost: product.cost_price,
          userId: actor.id,
          now,
        },
      );
      const balance = applyStockChange(db, {
        productId: product.id,
        qtyChange: change,
        type: 'adjustment',
        unitCost: product.cost_price,
        referenceType: 'adjustment',
        referenceId: Number(r.lastInsertRowid),
        referenceNo: adjustmentNo,
        note: body.note ? `${body.reason}: ${body.note}` : body.reason,
        userId: actor.id,
        at: now,
      });
      audit(db, actor, 'stock.adjust', 'product', product.id, {
        adjustmentNo,
        change,
        reason: body.reason,
        before: product.stock_qty,
        after: balance,
      });
      return { id: Number(r.lastInsertRowid), adjustmentNo, stockQty: balance };
    });
    res.status(201).json(result);
  });

  router.get('/movements', requirePermission('inventory.adjust', 'reports.view'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query, 500);
    const from = queryDay(req.query, 'from');
    const to = queryDay(req.query, 'to');
    const params = {
      from: from ?? null,
      to: to ? addDays(to, 1) : null,
      productId: queryInt(req.query, 'productId') ?? null,
      type: queryString(req.query, 'type') ?? null,
    };
    const where = `WHERE (@from IS NULL OR m.created_at >= @from) AND (@to IS NULL OR m.created_at < @to)
      AND (@productId IS NULL OR m.product_id = @productId) AND (@type IS NULL OR m.movement_type = @type)`;
    const total = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM stock_movements m ${where}`, params)!.n;
    const showCost = can(req, 'products.view_cost');
    const data = all<StockMovement>(
      db,
      `SELECT m.id, m.product_id AS productId, p.name AS productName, m.movement_type AS movementType,
         m.qty_change AS qtyChange, m.balance_after AS balanceAfter, m.unit_cost AS unitCost,
         m.reference_type AS referenceType, m.reference_id AS referenceId, m.reference_no AS referenceNo, m.note,
         u.full_name AS createdByName, m.created_at AS createdAt
       FROM stock_movements m JOIN products p ON p.id = m.product_id LEFT JOIN users u ON u.id = m.created_by
       ${where} ORDER BY m.id DESC LIMIT @limit OFFSET @offset`,
      { ...params, limit: pageSize, offset },
    ).map((m) => {
      if (!showCost) delete m.unitCost;
      return m;
    });
    res.json({ data, total, page, pageSize } satisfies Paginated<StockMovement>);
  });

  return router;
}
