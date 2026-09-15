import { Router } from 'express';
import { z } from 'zod';
import {
  PAYMENT_METHODS,
  type CashBookDay,
  type CashBookEntry,
  type DayClosing,
  type Expense,
  type ExpenseCategory,
  type Paginated,
  type Payment,
  type PaymentMethod,
} from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, tx, type DB } from '../db';
import { actorOf, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { conflict, notFound, unprocessable, badRequest } from '../lib/errors';
import { idParam, pagination, parse, queryBool, queryDay, queryInt, queryString, zs } from '../lib/http';
import { nextNumber } from '../lib/sequences';
import { getSettings } from '../lib/settings';
import { addDays, nowLocal, todayLocal, withCurrentTime } from '../lib/time';
import { postCustomerLedger, postSupplierLedger } from '../services/ledger';
import { mapPayment, PAYMENT_SELECT } from '../services/sales';

const EXPENSE_SELECT = `SELECT e.id, e.expense_no AS expenseNo, e.expense_date AS expenseDate, e.category_id AS categoryId,
  c.name AS categoryName, e.amount, e.method, e.paid_to AS paidTo, e.reference, e.notes, e.is_void AS isVoid,
  e.void_reason AS voidReason, u.full_name AS createdByName, e.created_at AS createdAt
FROM expenses e JOIN expense_categories c ON c.id = e.category_id LEFT JOIN users u ON u.id = e.created_by`;

function cashNet(db: DB, fromInclusive: string | null, toExclusive: string): number {
  const params = { from: fromInclusive, to: toExclusive };
  const pay = one<{ net: number | null }>(
    db,
    `SELECT SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) AS net FROM payments
     WHERE is_void = 0 AND method = 'cash' AND (@from IS NULL OR payment_date >= @from) AND payment_date < @to`,
    params,
  );
  const exp = one<{ total: number | null }>(
    db,
    `SELECT SUM(amount) AS total FROM expenses
     WHERE is_void = 0 AND method = 'cash' AND (@from IS NULL OR expense_date >= @from) AND expense_date < @to`,
    params,
  );
  return (pay?.net ?? 0) - (exp?.total ?? 0);
}

const CLOSING_SELECT = `SELECT d.id, d.closing_date AS closingDate, d.opening_cash AS openingCash, d.cash_in AS cashIn,
  d.cash_out AS cashOut, d.expected_cash AS expectedCash, d.counted_cash AS countedCash, d.difference, d.notes,
  u.full_name AS closedByName, d.created_at AS createdAt
FROM day_closings d LEFT JOIN users u ON u.id = d.closed_by`;

export function computeCashBook(db: DB, date: string): CashBookDay {
  const settings = getSettings(db);
  const last = one<{ closing_date: string; counted_cash: number }>(
    db,
    'SELECT closing_date, counted_cash FROM day_closings WHERE closing_date < ? ORDER BY closing_date DESC LIMIT 1',
    [date],
  );
  const openingCash = last
    ? last.counted_cash + cashNet(db, addDays(last.closing_date, 1), date)
    : settings.cash.openingBalance + cashNet(db, null, date);

  const next = addDays(date, 1);
  const payments = all<{
    payment_date: string;
    payment_no: string;
    direction: 'in' | 'out';
    amount: number;
    method: PaymentMethod;
    party: string | null;
    sale_no: string | null;
    purchase_no: string | null;
    sale_return_id: number | null;
    purchase_return_id: number | null;
    party_type: string;
  }>(
    db,
    `SELECT p.payment_date, p.payment_no, p.direction, p.amount, p.method, p.party_type,
       COALESCE(c.name, s.name, sa.customer_name) AS party, sa.invoice_no AS sale_no, pu.purchase_no,
       p.sale_return_id, p.purchase_return_id
     FROM payments p
     LEFT JOIN customers c ON c.id = p.customer_id
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN sales sa ON sa.id = p.sale_id
     LEFT JOIN purchases pu ON pu.id = p.purchase_id
     WHERE p.is_void = 0 AND p.payment_date >= @date AND p.payment_date < @next
     ORDER BY p.payment_date, p.id`,
    { date, next },
  );
  const expenses = all<{
    expense_date: string;
    expense_no: string;
    amount: number;
    method: PaymentMethod;
    category: string;
    paid_to: string | null;
  }>(
    db,
    `SELECT e.expense_date, e.expense_no, e.amount, e.method, c.name AS category, e.paid_to
     FROM expenses e JOIN expense_categories c ON c.id = e.category_id
     WHERE e.is_void = 0 AND e.expense_date >= @date AND e.expense_date < @next
     ORDER BY e.expense_date, e.id`,
    { date, next },
  );

  const totals = new Map<PaymentMethod, { received: number; paid: number }>();
  for (const m of PAYMENT_METHODS) totals.set(m, { received: 0, paid: 0 });

  const raw: Omit<CashBookEntry, 'balance'>[] = [];
  for (const p of payments) {
    const t = totals.get(p.method)!;
    if (p.direction === 'in') t.received += p.amount;
    else t.paid += p.amount;
    if (p.method !== 'cash') continue;
    let type: string;
    let description: string;
    if (p.sale_return_id) {
      type = 'Sale Refund';
      description = `Refund to ${p.party ?? 'walk-in customer'}${p.sale_no ? ` (${p.sale_no})` : ''}`;
    } else if (p.purchase_return_id) {
      type = 'Supplier Refund';
      description = `Refund from ${p.party ?? 'supplier'}`;
    } else if (p.sale_no) {
      type = 'Cash Sale';
      description = `${p.sale_no} - ${p.party ?? 'Walk-in customer'}`;
    } else if (p.purchase_no) {
      type = 'Purchase Payment';
      description = `${p.purchase_no} - ${p.party ?? ''}`;
    } else if (p.party_type === 'supplier') {
      type = 'Supplier Payment';
      description = p.party ?? '';
    } else {
      type = 'Customer Receipt';
      description = p.party ?? '';
    }
    raw.push({
      time: p.payment_date,
      type,
      referenceNo: p.payment_no,
      description,
      cashIn: p.direction === 'in' ? p.amount : 0,
      cashOut: p.direction === 'out' ? p.amount : 0,
    });
  }
  for (const e of expenses) {
    totals.get(e.method)!.paid += e.amount;
    if (e.method !== 'cash') continue;
    raw.push({
      time: e.expense_date,
      type: 'Expense',
      referenceNo: e.expense_no,
      description: `${e.category}${e.paid_to ? ` - ${e.paid_to}` : ''}`,
      cashIn: 0,
      cashOut: e.amount,
    });
  }
  raw.sort((a, b) => a.time.localeCompare(b.time));

  let balance = openingCash;
  let cashIn = 0;
  let cashOut = 0;
  const entries: CashBookEntry[] = raw.map((r) => {
    balance += r.cashIn - r.cashOut;
    cashIn += r.cashIn;
    cashOut += r.cashOut;
    return { ...r, balance };
  });

  const closing = one<DayClosing>(db, `${CLOSING_SELECT} WHERE d.closing_date = ?`, [date]) ?? null;
  return {
    date,
    openingCash,
    cashIn,
    cashOut,
    expectedCash: openingCash + cashIn - cashOut,
    entries,
    methodTotals: PAYMENT_METHODS.map((m) => ({ method: m, ...totals.get(m)! })),
    closing,
  };
}

export function paymentRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  router.get('/', requirePermission('cashbook.view', 'customers.receive_payment'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    const from = queryDay(req.query, 'from');
    const to = queryDay(req.query, 'to');
    if (from) {
      where.push('p.payment_date >= @from');
      params.from = from;
    }
    if (to) {
      where.push('p.payment_date < @to');
      params.to = addDays(to, 1);
    }
    const direction = queryString(req.query, 'direction');
    if (direction === 'in' || direction === 'out') {
      where.push('p.direction = @direction');
      params.direction = direction;
    }
    const method = queryString(req.query, 'method');
    if (method) {
      where.push('p.method = @method');
      params.method = method;
    }
    const customerId = queryInt(req.query, 'customerId');
    if (customerId) {
      where.push('p.customer_id = @customerId');
      params.customerId = customerId;
    }
    const supplierId = queryInt(req.query, 'supplierId');
    if (supplierId) {
      where.push('p.supplier_id = @supplierId');
      params.supplierId = supplierId;
    }
    if (queryBool(req.query, 'standalone')) {
      where.push('p.sale_id IS NULL AND p.purchase_id IS NULL');
    }
    if (!queryBool(req.query, 'includeVoid')) where.push('p.is_void = 0');
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM payments p ${whereSql}`, params)!.n;
    const data = all<Payment>(db, `${PAYMENT_SELECT} ${whereSql} ORDER BY p.id DESC LIMIT @limit OFFSET @offset`, {
      ...params,
      limit: pageSize,
      offset,
    }).map(mapPayment);
    res.json({ data, total, page, pageSize } satisfies Paginated<Payment>);
  });

  router.get('/:id', requirePermission('cashbook.view', 'customers.receive_payment'), (req, res) => {
    const row = one<Payment>(db, `${PAYMENT_SELECT} WHERE p.id = ?`, [idParam(req)]);
    if (!row) throw notFound('Payment');
    res.json(mapPayment(row));
  });

  router.post('/:id/void', requirePermission('payments.void'), (req, res) => {
    const id = idParam(req);
    const body = parse(z.object({ reason: zs.name(300) }), req.body);
    const actor = actorOf(req);
    tx(db, () => {
      const p = one<{
        id: number;
        payment_no: string;
        amount: number;
        direction: string;
        customer_id: number | null;
        supplier_id: number | null;
        sale_id: number | null;
        purchase_id: number | null;
        sale_return_id: number | null;
        purchase_return_id: number | null;
        is_void: number;
      }>(db, 'SELECT * FROM payments WHERE id = ?', [id]);
      if (!p) throw notFound('Payment');
      if (p.is_void) throw unprocessable('This payment is already void');
      if (p.sale_id || p.purchase_id || p.sale_return_id || p.purchase_return_id) {
        throw unprocessable('This payment belongs to an invoice. Cancel the invoice instead.');
      }
      const now = nowLocal();
      run(db, 'UPDATE payments SET is_void = 1, voided_by = ?, voided_at = ?, void_reason = ? WHERE id = ?', [
        actor.id,
        now,
        body.reason,
        id,
      ]);
      if (p.customer_id) {
        postCustomerLedger(db, {
          partyId: p.customer_id,
          entryDate: now,
          entryType: 'payment_void',
          referenceType: 'payment',
          referenceId: id,
          referenceNo: p.payment_no,
          description: `Payment ${p.payment_no} cancelled: ${body.reason}`,
          debit: p.direction === 'in' ? p.amount : 0,
          credit: p.direction === 'out' ? p.amount : 0,
          userId: actor.id,
          at: now,
        });
      }
      if (p.supplier_id) {
        postSupplierLedger(db, {
          partyId: p.supplier_id,
          entryDate: now,
          entryType: 'payment_void',
          referenceType: 'payment',
          referenceId: id,
          referenceNo: p.payment_no,
          description: `Payment ${p.payment_no} cancelled: ${body.reason}`,
          credit: p.direction === 'out' ? p.amount : 0,
          debit: p.direction === 'in' ? p.amount : 0,
          userId: actor.id,
          at: now,
        });
      }
      audit(db, actor, 'payment.void', 'payment', id, { paymentNo: p.payment_no, reason: body.reason });
    });
    res.json({ ok: true });
  });

  return router;
}

export function expenseRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  router.get('/categories', requirePermission('expenses.view'), (_req, res) => {
    res.json(
      all<ExpenseCategory>(
        db,
        'SELECT id, name, is_active AS isActive FROM expense_categories ORDER BY name',
      ).map((c) => ({ ...c, isActive: !!c.isActive })),
    );
  });

  const categorySchema = z.object({ name: zs.name(80), isActive: z.boolean().default(true) });

  router.post('/categories', requirePermission('expenses.manage'), (req, res) => {
    const body = parse(categorySchema, req.body);
    const now = nowLocal();
    const r = run(
      db,
      'INSERT INTO expense_categories (name, is_active, created_at, updated_at) VALUES (@name, @isActive, @now, @now)',
      { ...body, now },
    );
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  router.put('/categories/:id', requirePermission('expenses.manage'), (req, res) => {
    const body = parse(categorySchema, req.body);
    const r = run(db, 'UPDATE expense_categories SET name = @name, is_active = @isActive, updated_at = @now WHERE id = @id', {
      ...body,
      id: idParam(req),
      now: nowLocal(),
    });
    if (r.changes === 0) throw notFound('Expense category');
    res.json({ ok: true });
  });

  router.get('/', requirePermission('expenses.view'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const from = queryDay(req.query, 'from');
    const to = queryDay(req.query, 'to');
    const params = {
      from: from ?? null,
      to: to ? addDays(to, 1) : null,
      categoryId: queryInt(req.query, 'categoryId') ?? null,
      includeVoid: queryBool(req.query, 'includeVoid') ? 1 : 0,
    };
    const where = `WHERE (@from IS NULL OR e.expense_date >= @from) AND (@to IS NULL OR e.expense_date < @to)
      AND (@categoryId IS NULL OR e.category_id = @categoryId) AND (@includeVoid = 1 OR e.is_void = 0)`;
    const summary = one<{ n: number; total: number }>(
      db,
      `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN e.is_void = 0 THEN e.amount END), 0) AS total FROM expenses e ${where}`,
      params,
    )!;
    const data = all<Expense>(db, `${EXPENSE_SELECT} ${where} ORDER BY e.expense_date DESC, e.id DESC LIMIT @limit OFFSET @offset`, {
      ...params,
      limit: pageSize,
      offset,
    }).map((e) => ({ ...e, isVoid: !!e.isVoid }));
    res.json({ data, total: summary.n, page, pageSize, summary: { amount: summary.total } });
  });

  router.post('/', requirePermission('expenses.manage'), (req, res) => {
    const body = parse(
      z.object({
        expenseDate: zs.day.optional(),
        categoryId: zs.id,
        amount: zs.money.refine((v) => v > 0, 'Amount must be greater than zero'),
        method: z.enum(PAYMENT_METHODS),
        paidTo: zs.text(120),
        reference: zs.text(120),
        notes: zs.text(500),
      }),
      req.body,
    );
    const actor = actorOf(req);
    const id = tx(db, () => {
      if (!one(db, 'SELECT id FROM expense_categories WHERE id = ?', [body.categoryId])) {
        throw badRequest('Expense category not found');
      }
      const now = nowLocal();
      const expenseDate = body.expenseDate ? withCurrentTime(body.expenseDate) : now;
      if (expenseDate.slice(0, 10) > todayLocal()) throw badRequest('Expense date cannot be in the future');
      const expenseNo = nextNumber(db, 'expense');
      const r = run(
        db,
        `INSERT INTO expenses (expense_no, expense_date, category_id, amount, method, paid_to, reference, notes,
           created_by, created_at)
         VALUES (@expenseNo, @expenseDate, @categoryId, @amount, @method, @paidTo, @reference, @notes, @userId, @now)`,
        { ...body, expenseNo, expenseDate, userId: actor.id, now },
      );
      audit(db, actor, 'expense.create', 'expense', r.lastInsertRowid, { expenseNo, amount: body.amount });
      return Number(r.lastInsertRowid);
    });
    res.status(201).json(one<Expense>(db, `${EXPENSE_SELECT} WHERE e.id = ?`, [id]));
  });

  router.post('/:id/void', requirePermission('expenses.manage'), (req, res) => {
    const id = idParam(req);
    const body = parse(z.object({ reason: zs.name(300) }), req.body);
    tx(db, () => {
      const e = one<{ is_void: number }>(db, 'SELECT is_void FROM expenses WHERE id = ?', [id]);
      if (!e) throw notFound('Expense');
      if (e.is_void) throw unprocessable('This expense is already void');
      run(db, 'UPDATE expenses SET is_void = 1, voided_by = ?, voided_at = ?, void_reason = ? WHERE id = ?', [
        req.user!.id,
        nowLocal(),
        body.reason,
        id,
      ]);
      audit(db, actorOf(req), 'expense.void', 'expense', id, body);
    });
    res.json({ ok: true });
  });

  return router;
}

export function cashbookRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  router.get('/', requirePermission('cashbook.view'), (req, res) => {
    res.json(computeCashBook(db, queryDay(req.query, 'date') ?? todayLocal()));
  });

  router.get('/closings', requirePermission('cashbook.view'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const total = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM day_closings')!.n;
    const data = all<DayClosing>(db, `${CLOSING_SELECT} ORDER BY d.closing_date DESC LIMIT @limit OFFSET @offset`, {
      limit: pageSize,
      offset,
    });
    res.json({ data, total, page, pageSize } satisfies Paginated<DayClosing>);
  });

  router.post('/close', requirePermission('cashbook.close'), (req, res) => {
    const body = parse(
      z.object({ date: zs.day, countedCash: z.coerce.number().int().min(0).max(1e13), notes: zs.text(500) }),
      req.body,
    );
    if (body.date > todayLocal()) throw badRequest('Cannot close a future date');
    const actor = actorOf(req);
    const result = tx(db, () => {
      if (one(db, 'SELECT id FROM day_closings WHERE closing_date = ?', [body.date])) {
        throw conflict('This day has already been closed');
      }
      if (one(db, 'SELECT id FROM day_closings WHERE closing_date > ?', [body.date])) {
        throw unprocessable('A later day has already been closed. Days must be closed in order.');
      }
      const book = computeCashBook(db, body.date);
      const r = run(
        db,
        `INSERT INTO day_closings (closing_date, opening_cash, cash_in, cash_out, expected_cash, counted_cash,
           difference, notes, closed_by, created_at)
         VALUES (@date, @opening, @cashIn, @cashOut, @expected, @counted, @difference, @notes, @userId, @now)`,
        {
          date: body.date,
          opening: book.openingCash,
          cashIn: book.cashIn,
          cashOut: book.cashOut,
          expected: book.expectedCash,
          counted: body.countedCash,
          difference: body.countedCash - book.expectedCash,
          notes: body.notes,
          userId: actor.id,
          now: nowLocal(),
        },
      );
      audit(db, actor, 'cashbook.close', 'day_closing', r.lastInsertRowid, {
        date: body.date,
        expected: book.expectedCash,
        counted: body.countedCash,
      });
      return computeCashBook(db, body.date);
    });
    res.status(201).json(result);
  });

  router.delete('/closings/:date', requirePermission('settings.manage'), (req, res) => {
    const date = String(req.params.date);
    tx(db, () => {
      if (one(db, 'SELECT id FROM day_closings WHERE closing_date > ?', [date])) {
        throw unprocessable('Reopen later days first');
      }
      const r = run(db, 'DELETE FROM day_closings WHERE closing_date = ?', [date]);
      if (r.changes === 0) throw notFound('Day closing');
      audit(db, actorOf(req), 'cashbook.reopen', 'day_closing', null, { date });
    });
    res.json({ ok: true });
  });

  return router;
}
