import { Router } from 'express';
import { z } from 'zod';
import { PRICE_TIERS, type HeldBill, type Paginated, type Quotation, type QuotationItem } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, tx, type DB } from '../db';
import { actorOf, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, notFound, unprocessable } from '../lib/errors';
import { idParam, pagination, parse, queryDay, queryString, zs } from '../lib/http';
import { nextNumber } from '../lib/sequences';
import { getSettings } from '../lib/settings';
import { addDays, nowLocal, todayLocal } from '../lib/time';
import { escapeLike } from '../services/products';
import { prepareCart } from '../services/pricing';
import { cartItemSchema } from '../services/sales';
import type { AuthUser } from '../context';

const quotationSchema = z.object({
  customerId: zs.optId,
  customerName: zs.text(120),
  customerPhone: zs.phone,
  priceTier: z.enum(PRICE_TIERS).default('retail'),
  items: z.array(cartItemSchema).min(1, 'Add at least one item').max(300),
  billDiscount: zs.money.default(0),
  deliveryCharges: zs.money.default(0),
  labourCharges: zs.money.default(0),
  validUntil: zs.day.nullable().optional(),
  notes: zs.text(1000),
});
type QuotationInput = z.infer<typeof quotationSchema>;

const Q_SELECT = `SELECT q.id, q.quotation_no AS quotationNo, q.quotation_date AS quotationDate,
  q.valid_until AS validUntil, q.customer_id AS customerId, COALESCE(c.name, q.customer_name) AS customerName,
  COALESCE(c.phone, q.customer_phone) AS customerPhone, c.address AS customerAddress, q.status,
  q.price_tier AS priceTier, q.subtotal, q.item_discount AS itemDiscount, q.bill_discount AS billDiscount,
  q.taxable_value AS taxableValue, q.tax_total AS taxTotal, q.delivery_charges AS deliveryCharges,
  q.labour_charges AS labourCharges, q.round_off AS roundOff, q.grand_total AS grandTotal,
  q.prices_include_tax AS pricesIncludeTax, q.notes, q.sale_id AS saleId, s.invoice_no AS saleInvoiceNo,
  u.full_name AS createdByName, q.created_at AS createdAt
FROM quotations q
LEFT JOIN customers c ON c.id = q.customer_id
LEFT JOIN sales s ON s.id = q.sale_id
LEFT JOIN users u ON u.id = q.created_by`;

function getQuotation(db: DB, id: number): Quotation {
  const row = one<Quotation>(db, `${Q_SELECT} WHERE q.id = ?`, [id]);
  if (!row) throw notFound('Quotation');
  row.pricesIncludeTax = !!row.pricesIncludeTax;
  row.items = all<QuotationItem>(
    db,
    `SELECT qi.id, qi.product_id AS productId, qi.product_name AS productName, p.urdu_name AS urduName,
       qi.unit_id AS unitId, qi.unit_name AS unitName, qi.unit_factor AS unitFactor, qi.qty, qi.unit_price AS unitPrice,
       qi.discount, qi.bill_discount_share AS billDiscountShare, qi.tax_rate AS taxRate,
       qi.taxable_value AS taxableValue, qi.tax_amount AS taxAmount, qi.line_total AS lineTotal
     FROM quotation_items qi JOIN products p ON p.id = qi.product_id
     WHERE qi.quotation_id = ? ORDER BY qi.id`,
    [id],
  );
  return row;
}

function saveQuotation(db: DB, id: number | null, input: QuotationInput, user: AuthUser): number {
  const settings = getSettings(db);
  const { lines, totals } = prepareCart(db, input, settings, user);
  let customer: { id: number; name: string; phone: string | null } | undefined;
  if (input.customerId) {
    customer = one(db, 'SELECT id, name, phone FROM customers WHERE id = ?', [input.customerId]);
    if (!customer) throw badRequest('Customer not found');
  }
  const now = nowLocal();
  const validUntil = input.validUntil ?? addDays(todayLocal(), settings.quotation.validityDays);
  const values = {
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? input.customerName ?? null,
    customerPhone: customer?.phone ?? input.customerPhone ?? null,
    priceTier: input.priceTier,
    subtotal: totals.subtotal,
    itemDiscount: totals.itemDiscount,
    billDiscount: totals.billDiscount,
    taxableValue: totals.taxableValue,
    taxTotal: totals.taxTotal,
    deliveryCharges: totals.deliveryCharges,
    labourCharges: totals.labourCharges,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
    pricesIncludeTax: settings.tax.pricesIncludeTax,
    validUntil,
    notes: input.notes,
    now,
  };

  let quotationId: number;
  if (id === null) {
    const r = run(
      db,
      `INSERT INTO quotations (quotation_no, quotation_date, valid_until, customer_id, customer_name, customer_phone,
         status, price_tier, subtotal, item_discount, bill_discount, taxable_value, tax_total, delivery_charges,
         labour_charges, round_off, grand_total, prices_include_tax, notes, created_by, created_at, updated_at)
       VALUES (@quotationNo, @now, @validUntil, @customerId, @customerName, @customerPhone, 'open', @priceTier,
         @subtotal, @itemDiscount, @billDiscount, @taxableValue, @taxTotal, @deliveryCharges, @labourCharges,
         @roundOff, @grandTotal, @pricesIncludeTax, @notes, @userId, @now, @now)`,
      { ...values, quotationNo: nextNumber(db, 'quotation'), userId: user.id },
    );
    quotationId = Number(r.lastInsertRowid);
  } else {
    const existing = one<{ status: string }>(db, 'SELECT status FROM quotations WHERE id = ?', [id]);
    if (!existing) throw notFound('Quotation');
    if (existing.status !== 'open') throw unprocessable('Only open quotations can be edited');
    run(
      db,
      `UPDATE quotations SET valid_until = @validUntil, customer_id = @customerId, customer_name = @customerName,
         customer_phone = @customerPhone, price_tier = @priceTier, subtotal = @subtotal, item_discount = @itemDiscount,
         bill_discount = @billDiscount, taxable_value = @taxableValue, tax_total = @taxTotal,
         delivery_charges = @deliveryCharges, labour_charges = @labourCharges, round_off = @roundOff,
         grand_total = @grandTotal, prices_include_tax = @pricesIncludeTax, notes = @notes, updated_at = @now
       WHERE id = @id`,
      { ...values, id },
    );
    run(db, 'DELETE FROM quotation_items WHERE quotation_id = ?', [id]);
    quotationId = id;
  }

  lines.forEach((l, i) => {
    const t = totals.lines[i];
    run(
      db,
      `INSERT INTO quotation_items (quotation_id, product_id, product_name, unit_id, unit_name, unit_factor, qty,
         unit_price, discount, bill_discount_share, tax_rate, taxable_value, tax_amount, line_total)
       VALUES (@quotationId, @productId, @productName, @unitId, @unitName, @factor, @qty, @unitPrice, @discount,
         @share, @taxRate, @taxableValue, @taxAmount, @lineTotal)`,
      {
        quotationId,
        productId: l.product.id,
        productName: l.product.name,
        unitId: l.unit.unitId,
        unitName: l.unit.unitName,
        factor: l.unit.factor,
        qty: l.qty,
        unitPrice: l.unitPrice,
        discount: t.discount,
        share: t.billDiscountShare,
        taxRate: t.taxRate,
        taxableValue: t.taxableValue,
        taxAmount: t.taxAmount,
        lineTotal: t.total,
      },
    );
  });
  return quotationId;
}

export function quotationRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;
  router.use(requirePermission('quotations.manage'));

  router.get('/', (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    const from = queryDay(req.query, 'from');
    const to = queryDay(req.query, 'to');
    if (from) {
      where.push('q.quotation_date >= @from');
      params.from = from;
    }
    if (to) {
      where.push('q.quotation_date < @to');
      params.to = addDays(to, 1);
    }
    const status = queryString(req.query, 'status');
    if (status) {
      where.push('q.status = @status');
      params.status = status;
    }
    const search = queryString(req.query, 'search');
    if (search) {
      params.search = `%${escapeLike(search)}%`;
      where.push(`(q.quotation_no LIKE @search ESCAPE '\\' OR COALESCE(c.name, q.customer_name) LIKE @search ESCAPE '\\')`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = one<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM quotations q LEFT JOIN customers c ON c.id = q.customer_id ${whereSql}`,
      params,
    )!.n;
    const data = all<Quotation>(db, `${Q_SELECT} ${whereSql} ORDER BY q.id DESC LIMIT @limit OFFSET @offset`, {
      ...params,
      limit: pageSize,
      offset,
    }).map((q) => ({ ...q, pricesIncludeTax: !!q.pricesIncludeTax }));
    res.json({ data, total, page, pageSize } satisfies Paginated<Quotation>);
  });

  router.get('/:id', (req, res) => {
    res.json(getQuotation(db, idParam(req)));
  });

  router.post('/', (req, res) => {
    const body = parse(quotationSchema, req.body);
    const id = tx(db, () => {
      const qid = saveQuotation(db, null, body, req.user!);
      audit(db, actorOf(req), 'quotation.create', 'quotation', qid);
      return qid;
    });
    res.status(201).json(getQuotation(db, id));
  });

  router.put('/:id', (req, res) => {
    const id = idParam(req);
    const body = parse(quotationSchema, req.body);
    tx(db, () => {
      saveQuotation(db, id, body, req.user!);
      audit(db, actorOf(req), 'quotation.update', 'quotation', id);
    });
    res.json(getQuotation(db, id));
  });

  router.post('/:id/cancel', (req, res) => {
    const id = idParam(req);
    tx(db, () => {
      const q = one<{ status: string }>(db, 'SELECT status FROM quotations WHERE id = ?', [id]);
      if (!q) throw notFound('Quotation');
      if (q.status !== 'open') throw unprocessable('Only open quotations can be cancelled');
      run(db, "UPDATE quotations SET status = 'cancelled', updated_at = ? WHERE id = ?", [nowLocal(), id]);
      audit(db, actorOf(req), 'quotation.cancel', 'quotation', id);
    });
    res.json(getQuotation(db, id));
  });

  return router;
}

export function heldBillRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;
  router.use(requirePermission('pos.sell'));

  router.get('/', (_req, res) => {
    const rows = all<HeldBill & { payload: string }>(
      db,
      `SELECT h.id, h.label, h.customer_id AS customerId, c.name AS customerName, h.payload, h.total,
         u.full_name AS createdByName, h.created_at AS createdAt
       FROM held_bills h LEFT JOIN customers c ON c.id = h.customer_id LEFT JOIN users u ON u.id = h.created_by
       ORDER BY h.id DESC`,
    );
    res.json(rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) })));
  });

  router.post('/', (req, res) => {
    const body = parse(
      z.object({
        label: zs.name(80),
        customerId: zs.optId,
        total: zs.money.default(0),
        payload: z.record(z.unknown()),
      }),
      req.body,
    );
    const payload = JSON.stringify(body.payload);
    if (payload.length > 200_000) throw badRequest('Held bill is too large');
    const r = run(
      db,
      `INSERT INTO held_bills (label, customer_id, payload, total, created_by, created_at)
       VALUES (@label, @customerId, @payload, @total, @userId, @now)`,
      { ...body, payload, userId: req.user!.id, now: nowLocal() },
    );
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.delete('/:id', (req, res) => {
    run(db, 'DELETE FROM held_bills WHERE id = ?', [idParam(req)]);
    res.json({ ok: true });
  });

  return router;
}
