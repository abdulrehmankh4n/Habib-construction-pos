import { Router } from 'express';
import { z } from 'zod';
import { DELIVERY_STATUSES, type Paginated, type Sale, type SaleReturn } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, tx } from '../db';
import { actorOf, can, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { notFound, unprocessable } from '../lib/errors';
import { idParam, pagination, parse, queryDay, queryInt, queryString, zs } from '../lib/http';
import { addDays, nowLocal } from '../lib/time';
import { escapeLike } from '../services/products';
import {
  createSale,
  createSaleReturn,
  getSale,
  getSaleReturn,
  mapSale,
  returnInputSchema,
  SALE_SELECT,
  saleInputSchema,
  voidSale,
} from '../services/sales';
import { submitSaleToFbr, syncPendingFbr } from '../services/fbr';
import { getSettings } from '../lib/settings';
import { autoSms } from '../services/notifications';

export function saleRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  router.get('/', requirePermission('sales.view'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    const from = queryDay(req.query, 'from');
    const to = queryDay(req.query, 'to');
    if (from) {
      where.push('s.sale_date >= @from');
      params.from = from;
    }
    if (to) {
      where.push('s.sale_date < @to');
      params.to = addDays(to, 1);
    }
    const customerId = queryInt(req.query, 'customerId');
    if (customerId) {
      where.push('s.customer_id = @customerId');
      params.customerId = customerId;
    }
    const status = queryString(req.query, 'status');
    if (status === 'completed' || status === 'void') {
      where.push('s.status = @status');
      params.status = status;
    }
    const payment = queryString(req.query, 'payment');
    if (payment === 'credit') where.push('s.balance_due > 0');
    if (payment === 'paid') where.push('s.balance_due = 0');
    const delivery = queryString(req.query, 'delivery');
    if (delivery && (DELIVERY_STATUSES as readonly string[]).includes(delivery)) {
      where.push('s.delivery_status = @delivery');
      params.delivery = delivery;
    }
    if (delivery === 'open') where.push("s.delivery_status IN ('pending','dispatched')");
    const fbr = queryString(req.query, 'fbr');
    if (fbr) {
      where.push('s.fbr_status = @fbr');
      params.fbr = fbr;
    }
    const createdBy = queryInt(req.query, 'createdBy');
    if (createdBy) {
      where.push('s.created_by = @createdBy');
      params.createdBy = createdBy;
    }
    const search = queryString(req.query, 'search');
    if (search) {
      params.search = `%${escapeLike(search)}%`;
      where.push(
        `(s.invoice_no LIKE @search ESCAPE '\\' OR s.customer_name LIKE @search ESCAPE '\\'
          OR s.customer_phone LIKE @search ESCAPE '\\' OR s.vehicle_no LIKE @search ESCAPE '\\')`,
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const summary = one<{ n: number; total: number; balance: number }>(
      db,
      `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.grand_total END), 0) AS total,
         COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.balance_due END), 0) AS balance
       FROM sales s ${whereSql}`,
      params,
    )!;
    const rows = all<Sale>(db, `${SALE_SELECT} ${whereSql} ORDER BY s.id DESC LIMIT @limit OFFSET @offset`, {
      ...params,
      limit: pageSize,
      offset,
    });
    const showCost = can(req, 'reports.profit');
    res.json({
      data: rows.map((r) => mapSale(r, showCost)),
      total: summary.n,
      page,
      pageSize,
      summary: { grandTotal: summary.total, balanceDue: summary.balance },
    } satisfies Paginated<Sale> & { summary: unknown });
  });

  router.get('/returns', requirePermission('sales.view'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const from = queryDay(req.query, 'from');
    const to = queryDay(req.query, 'to');
    const params = { from: from ?? null, to: to ? addDays(to, 1) : null };
    const where = `WHERE (@from IS NULL OR r.return_date >= @from) AND (@to IS NULL OR r.return_date < @to)`;
    const total = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM sale_returns r ${where}`, params)!.n;
    const data = all<SaleReturn>(
      db,
      `SELECT r.id, r.return_no AS returnNo, r.sale_id AS saleId, s.invoice_no AS invoiceNo, r.customer_id AS customerId,
         COALESCE(c.name, s.customer_name) AS customerName, r.return_date AS returnDate, r.total_amount AS totalAmount,
         r.tax_total AS taxTotal, r.refund_method AS refundMethod, r.refund_amount AS refundAmount, r.reason, r.notes,
         u.full_name AS createdByName, r.created_at AS createdAt
       FROM sale_returns r JOIN sales s ON s.id = r.sale_id
       LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN users u ON u.id = r.created_by
       ${where} ORDER BY r.id DESC LIMIT @limit OFFSET @offset`,
      { ...params, limit: pageSize, offset },
    );
    res.json({ data, total, page, pageSize } satisfies Paginated<SaleReturn>);
  });

  router.get('/returns/:id', requirePermission('sales.view'), (req, res) => {
    res.json(getSaleReturn(db, idParam(req)));
  });

  router.get('/:id', requirePermission('sales.view', 'pos.sell'), (req, res) => {
    res.json(getSale(db, idParam(req), can(req, 'reports.profit')));
  });

  router.post('/', requirePermission('pos.sell'), async (req, res) => {
    const body = parse(saleInputSchema, req.body);
    const actor = actorOf(req);
    const saleId = tx(db, () => createSale(db, body, req.user!, actor));
    if (getSettings(db).fbr.enabled) await submitSaleToFbr(ctx, saleId);
    autoSms(ctx, 'sale', saleId, req.user!.id);
    res.status(201).json(getSale(db, saleId, can(req, 'reports.profit')));
  });

  router.post('/:id/void', requirePermission('sales.void'), (req, res) => {
    const id = idParam(req);
    const body = parse(z.object({ reason: zs.name(300) }), req.body);
    tx(db, () => voidSale(db, id, body.reason, req.user!, actorOf(req)));
    res.json(getSale(db, id, can(req, 'reports.profit')));
  });

  router.post('/:id/returns', requirePermission('sales.return'), (req, res) => {
    const id = idParam(req);
    const body = parse(returnInputSchema, req.body);
    const returnId = tx(db, () => createSaleReturn(db, id, body, req.user!, actorOf(req)));
    res.status(201).json(getSaleReturn(db, returnId));
  });

  router.patch('/:id/delivery', requirePermission('deliveries.manage'), (req, res) => {
    const id = idParam(req);
    const body = parse(
      z.object({
        status: z.enum(DELIVERY_STATUSES),
        address: zs.text(300),
        vehicleNo: zs.text(30),
        driverName: zs.text(80),
        driverPhone: zs.phone,
      }),
      req.body,
    );
    tx(db, () => {
      const sale = one<{ status: string; delivery_required: number }>(
        db,
        'SELECT status, delivery_required FROM sales WHERE id = ?',
        [id],
      );
      if (!sale) throw notFound('Sale');
      if (sale.status === 'void') throw unprocessable('This sale has been cancelled');
      const now = nowLocal();
      run(
        db,
        `UPDATE sales SET delivery_required = 1, delivery_status = @status, delivery_address = @address,
           vehicle_no = @vehicleNo, driver_name = @driverName, driver_phone = @driverPhone,
           delivered_at = CASE WHEN @status = 'delivered' THEN @now ELSE NULL END, updated_at = @now
         WHERE id = @id`,
        { ...body, id, now },
      );
      audit(db, actorOf(req), 'sale.delivery_update', 'sale', id, body);
    });
    res.json(getSale(db, id, can(req, 'reports.profit')));
  });

  router.post('/:id/fbr-sync', requirePermission('sales.void'), async (req, res) => {
    const id = idParam(req);
    if (!getSettings(db).fbr.enabled) throw unprocessable('FBR integration is not enabled in settings');
    await submitSaleToFbr(ctx, id);
    res.json(getSale(db, id, can(req, 'reports.profit')));
  });

  router.post('/fbr/sync-pending', requirePermission('sales.void'), async (_req, res) => {
    const count = await syncPendingFbr(ctx, 50);
    res.json({ processed: count });
  });

  return router;
}
