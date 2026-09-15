import { Router } from 'express';
import { z } from 'zod';
import type { Paginated, Purchase, PurchaseReturn } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, tx } from '../db';
import { actorOf, requirePermission } from '../middleware/auth';
import { idParam, pagination, parse, queryDay, queryInt, queryString, zs } from '../lib/http';
import { addDays } from '../lib/time';
import { escapeLike } from '../services/products';
import {
  createPurchase,
  createPurchaseReturn,
  getPurchase,
  PURCHASE_SELECT,
  purchaseInputSchema,
  purchaseReturnSchema,
  voidPurchase,
} from '../services/purchases';

export function purchaseRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  router.get('/', requirePermission('purchases.view'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    const from = queryDay(req.query, 'from');
    const to = queryDay(req.query, 'to');
    if (from) {
      where.push('p.purchase_date >= @from');
      params.from = from;
    }
    if (to) {
      where.push('p.purchase_date < @to');
      params.to = addDays(to, 1);
    }
    const supplierId = queryInt(req.query, 'supplierId');
    if (supplierId) {
      where.push('p.supplier_id = @supplierId');
      params.supplierId = supplierId;
    }
    const status = queryString(req.query, 'status');
    if (status === 'completed' || status === 'void') {
      where.push('p.status = @status');
      params.status = status;
    }
    const search = queryString(req.query, 'search');
    if (search) {
      params.search = `%${escapeLike(search)}%`;
      where.push(
        `(p.purchase_no LIKE @search ESCAPE '\\' OR p.supplier_invoice_no LIKE @search ESCAPE '\\'
          OR s.name LIKE @search ESCAPE '\\' OR p.vehicle_no LIKE @search ESCAPE '\\')`,
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const summary = one<{ n: number; total: number }>(
      db,
      `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.grand_total END), 0) AS total
       FROM purchases p JOIN suppliers s ON s.id = p.supplier_id ${whereSql}`,
      params,
    )!;
    const data = all<Purchase>(db, `${PURCHASE_SELECT} ${whereSql} ORDER BY p.id DESC LIMIT @limit OFFSET @offset`, {
      ...params,
      limit: pageSize,
      offset,
    });
    res.json({
      data,
      total: summary.n,
      page,
      pageSize,
      summary: { grandTotal: summary.total },
    } satisfies Paginated<Purchase> & { summary: unknown });
  });

  router.get('/returns', requirePermission('purchases.view'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const total = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM purchase_returns')!.n;
    const data = all<PurchaseReturn>(
      db,
      `SELECT r.id, r.return_no AS returnNo, r.purchase_id AS purchaseId, p.purchase_no AS purchaseNo,
         r.supplier_id AS supplierId, s.name AS supplierName, r.return_date AS returnDate,
         r.total_amount AS totalAmount, r.refund_method AS refundMethod, r.refund_amount AS refundAmount,
         r.reason, r.notes, u.full_name AS createdByName, r.created_at AS createdAt
       FROM purchase_returns r JOIN purchases p ON p.id = r.purchase_id JOIN suppliers s ON s.id = r.supplier_id
       LEFT JOIN users u ON u.id = r.created_by ORDER BY r.id DESC LIMIT @limit OFFSET @offset`,
      { limit: pageSize, offset },
    );
    res.json({ data, total, page, pageSize } satisfies Paginated<PurchaseReturn>);
  });

  router.get('/:id', requirePermission('purchases.view'), (req, res) => {
    res.json(getPurchase(db, idParam(req)));
  });

  router.post('/', requirePermission('purchases.manage'), (req, res) => {
    const body = parse(purchaseInputSchema, req.body);
    const id = tx(db, () => createPurchase(db, body, req.user!, actorOf(req)));
    res.status(201).json(getPurchase(db, id));
  });

  router.post('/:id/void', requirePermission('purchases.manage'), (req, res) => {
    const id = idParam(req);
    const body = parse(z.object({ reason: zs.name(300) }), req.body);
    tx(db, () => voidPurchase(db, id, body.reason, req.user!, actorOf(req)));
    res.json(getPurchase(db, id));
  });

  router.post('/:id/returns', requirePermission('purchases.manage'), (req, res) => {
    const id = idParam(req);
    const body = parse(purchaseReturnSchema, req.body);
    tx(db, () => createPurchaseReturn(db, id, body, req.user!, actorOf(req)));
    res.status(201).json(getPurchase(db, id));
  });

  return router;
}
