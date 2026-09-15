import { Router } from 'express';
import { z } from 'zod';
import { CUSTOMER_TYPES, PAYMENT_METHODS, PRICE_TIERS, type Customer, type Paginated, type Supplier } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, tx } from '../db';
import { actorOf, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { conflict, notFound } from '../lib/errors';
import { idParam, pagination, parse, queryBool, queryDay, queryString, zs } from '../lib/http';
import { nowLocal, withCurrentTime } from '../lib/time';
import { escapeLike } from '../services/products';
import {
  customerBalance,
  postCustomerLedger,
  postSupplierLedger,
  statement,
  supplierBalance,
} from '../services/ledger';
import { recordPayment } from '../services/payments';
import { autoSms } from '../services/notifications';

const customerSchema = z.object({
  name: zs.name(120),
  fatherName: zs.text(120),
  phone: zs.phone,
  cnic: zs.cnic,
  email: z
    .string()
    .trim()
    .email('Invalid email')
    .max(120)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  address: zs.text(300),
  city: zs.text(80),
  ntn: zs.text(30),
  strn: zs.text(30),
  customerType: z.enum(CUSTOMER_TYPES).default('retail'),
  priceTier: z.enum(PRICE_TIERS).default('retail'),
  creditLimit: zs.optMoney,
  openingBalance: z.coerce.number().int().min(-1e13).max(1e13).default(0),
  notes: zs.text(1000),
  isActive: z.boolean().default(true),
});

const supplierSchema = z.object({
  name: zs.name(120),
  company: zs.text(120),
  phone: zs.phone,
  email: z
    .string()
    .trim()
    .email('Invalid email')
    .max(120)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  address: zs.text(300),
  city: zs.text(80),
  ntn: zs.text(30),
  strn: zs.text(30),
  openingBalance: z.coerce.number().int().min(-1e13).max(1e13).default(0),
  notes: zs.text(1000),
  isActive: z.boolean().default(true),
});

const paymentSchema = z.object({
  amount: zs.money.refine((v) => v > 0, 'Amount must be greater than zero'),
  method: z.enum(PAYMENT_METHODS),
  reference: zs.text(120),
  paymentDate: zs.day.optional(),
  notes: zs.text(500),
});

const adjustmentSchema = z.object({
  direction: z.enum(['increase', 'decrease']),
  amount: zs.money.refine((v) => v > 0, 'Amount must be greater than zero'),
  reason: zs.name(300),
});

const CUSTOMER_SELECT = `SELECT c.id, c.name, c.father_name AS fatherName, c.phone, c.cnic, c.email, c.address, c.city, c.ntn, c.strn,
  c.customer_type AS customerType, c.price_tier AS priceTier, c.credit_limit AS creditLimit,
  c.opening_balance AS openingBalance,
  c.opening_balance + COALESCE((SELECT SUM(debit - credit) FROM customer_ledger l WHERE l.customer_id = c.id), 0) AS balance,
  c.notes, c.is_active AS isActive, c.created_at AS createdAt
FROM customers c`;

const SUPPLIER_SELECT = `SELECT s.id, s.name, s.company, s.phone, s.email, s.address, s.city, s.ntn, s.strn,
  s.opening_balance AS openingBalance,
  s.opening_balance + COALESCE((SELECT SUM(credit - debit) FROM supplier_ledger l WHERE l.supplier_id = s.id), 0) AS balance,
  s.notes, s.is_active AS isActive, s.created_at AS createdAt
FROM suppliers s`;

function searchClause(search: string | undefined, columns: string[], params: Record<string, unknown>): string[] {
  if (!search) return [];
  return search
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((term, i) => {
      params[`s${i}`] = `%${escapeLike(term)}%`;
      return `(${columns.map((c) => `${c} LIKE @s${i} ESCAPE '\\'`).join(' OR ')})`;
    });
}

export function customerRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;
  const get = (id: number): Customer => {
    const row = one<Customer>(db, `${CUSTOMER_SELECT} WHERE c.id = ?`, [id]);
    if (!row) throw notFound('Customer');
    return { ...row, isActive: !!row.isActive };
  };

  router.get('/', requirePermission('customers.view', 'pos.sell'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query, 500);
    const params: Record<string, unknown> = {};
    const where = searchClause(queryString(req.query, 'search'), ['c.name', 'c.phone', 'c.cnic', 'c.city'], params);
    if (!(queryBool(req.query, 'includeInactive') ?? false)) where.push('c.is_active = 1');
    const type = queryString(req.query, 'type');
    if (type) {
      where.push('c.customer_type = @type');
      params.type = type;
    }
    const base = `SELECT * FROM (${CUSTOMER_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}) x`;
    const filter = queryBool(req.query, 'withBalance') ? 'WHERE x.balance != 0' : '';
    const sort = queryString(req.query, 'sort') === 'balance' ? 'x.balance DESC' : 'x.name COLLATE NOCASE';
    const total = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM (${base} ${filter})`, params)!.n;
    const data = all<Customer>(db, `${base} ${filter} ORDER BY ${sort} LIMIT @limit OFFSET @offset`, {
      ...params,
      limit: pageSize,
      offset,
    }).map((c) => ({ ...c, isActive: !!c.isActive }));
    res.json({ data, total, page, pageSize } satisfies Paginated<Customer>);
  });

  router.get('/:id', requirePermission('customers.view', 'pos.sell'), (req, res) => {
    res.json(get(idParam(req)));
  });

  router.post('/', requirePermission('customers.manage'), (req, res) => {
    const body = parse(customerSchema, req.body);
    const now = nowLocal();
    const id = tx(db, () => {
      if (body.phone) {
        const dup = one<{ name: string }>(db, 'SELECT name FROM customers WHERE phone = ? AND is_active = 1', [
          body.phone,
        ]);
        if (dup) throw conflict(`Phone number already belongs to customer "${dup.name}"`);
      }
      const r = run(
        db,
        `INSERT INTO customers (name, father_name, phone, cnic, email, address, city, ntn, strn, customer_type, price_tier,
           credit_limit, opening_balance, notes, is_active, created_at, updated_at)
         VALUES (@name, @fatherName, @phone, @cnic, @email, @address, @city, @ntn, @strn, @customerType, @priceTier,
           @creditLimit, @openingBalance, @notes, @isActive, @now, @now)`,
        { ...body, now },
      );
      audit(db, actorOf(req), 'customer.create', 'customer', r.lastInsertRowid, { name: body.name });
      return Number(r.lastInsertRowid);
    });
    res.status(201).json(get(id));
  });

  router.put('/:id', requirePermission('customers.manage'), (req, res) => {
    const id = idParam(req);
    const body = parse(customerSchema, req.body);
    tx(db, () => {
      const existing = one<{ opening_balance: number; credit_limit: number | null }>(
        db,
        'SELECT opening_balance, credit_limit FROM customers WHERE id = ?',
        [id],
      );
      if (!existing) throw notFound('Customer');
      const financialChange =
        existing.opening_balance !== body.openingBalance || existing.credit_limit !== (body.creditLimit ?? null);
      if (financialChange && !req.user!.permissions.includes('payments.void')) {
        body.openingBalance = existing.opening_balance;
        body.creditLimit = existing.credit_limit;
      }
      run(
        db,
        `UPDATE customers SET name = @name, father_name = @fatherName, phone = @phone, cnic = @cnic, email = @email, address = @address,
           city = @city, ntn = @ntn, strn = @strn, customer_type = @customerType, price_tier = @priceTier,
           credit_limit = @creditLimit, opening_balance = @openingBalance, notes = @notes, is_active = @isActive,
           updated_at = @now WHERE id = @id`,
        { ...body, id, now: nowLocal() },
      );
      audit(db, actorOf(req), 'customer.update', 'customer', id, {
        name: body.name,
        ...(financialChange ? { openingBalance: body.openingBalance, creditLimit: body.creditLimit } : {}),
      });
    });
    res.json(get(id));
  });

  router.delete('/:id', requirePermission('customers.manage'), (req, res) => {
    const id = idParam(req);
    tx(db, () => {
      const used =
        one(db, 'SELECT 1 FROM customer_ledger WHERE customer_id = ? LIMIT 1', [id]) ??
        one(db, 'SELECT 1 FROM sales WHERE customer_id = ? LIMIT 1', [id]) ??
        one(db, 'SELECT 1 FROM quotations WHERE customer_id = ? LIMIT 1', [id]);
      if (used) throw conflict('This customer has transactions and cannot be deleted. Deactivate instead.');
      const r = run(db, 'DELETE FROM customers WHERE id = ?', [id]);
      if (r.changes === 0) throw notFound('Customer');
      audit(db, actorOf(req), 'customer.delete', 'customer', id);
    });
    res.json({ ok: true });
  });

  router.get('/:id/statement', requirePermission('customers.view'), (req, res) => {
    res.json(statement(db, 'customer', idParam(req), queryDay(req.query, 'from'), queryDay(req.query, 'to')));
  });

  router.post('/:id/payments', requirePermission('customers.receive_payment'), (req, res) => {
    const id = idParam(req);
    const body = parse(paymentSchema, req.body);
    const actor = actorOf(req);
    const result = tx(db, () => {
      const customer = get(id);
      const at = nowLocal();
      const paymentDate = body.paymentDate ? withCurrentTime(body.paymentDate) : at;
      const p = recordPayment(db, {
        direction: 'in',
        partyType: 'customer',
        customerId: id,
        method: body.method,
        amount: body.amount,
        reference: body.reference,
        paymentDate,
        notes: body.notes,
        userId: actor.id,
        at,
      });
      postCustomerLedger(db, {
        partyId: id,
        entryDate: paymentDate,
        entryType: 'payment',
        referenceType: 'payment',
        referenceId: p.id,
        referenceNo: p.paymentNo,
        description: `Payment received (${body.method.replace('_', ' ')})${body.reference ? ` Ref: ${body.reference}` : ''}`,
        credit: body.amount,
        userId: actor.id,
        at,
      });
      audit(db, actor, 'customer.payment', 'payment', p.id, { customer: customer.name, amount: body.amount });
      return { ...p, balance: customerBalance(db, id) };
    });
    autoSms(ctx, 'payment', result.id, actor.id);
    res.status(201).json(result);
  });

  router.post('/:id/adjustments', requirePermission('payments.void'), (req, res) => {
    const id = idParam(req);
    const body = parse(adjustmentSchema, req.body);
    const actor = actorOf(req);
    const balance = tx(db, () => {
      get(id);
      const at = nowLocal();
      postCustomerLedger(db, {
        partyId: id,
        entryDate: at,
        entryType: 'adjustment',
        referenceType: 'adjustment',
        description: `Balance adjustment: ${body.reason}`,
        debit: body.direction === 'increase' ? body.amount : 0,
        credit: body.direction === 'decrease' ? body.amount : 0,
        userId: actor.id,
        at,
      });
      audit(db, actor, 'customer.adjustment', 'customer', id, body);
      return customerBalance(db, id);
    });
    res.status(201).json({ balance });
  });

  return router;
}

export function supplierRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;
  const get = (id: number): Supplier => {
    const row = one<Supplier>(db, `${SUPPLIER_SELECT} WHERE s.id = ?`, [id]);
    if (!row) throw notFound('Supplier');
    return { ...row, isActive: !!row.isActive };
  };

  router.get('/', requirePermission('suppliers.view', 'products.manage'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query, 500);
    const params: Record<string, unknown> = {};
    const where = searchClause(queryString(req.query, 'search'), ['s.name', 's.company', 's.phone', 's.city'], params);
    if (!(queryBool(req.query, 'includeInactive') ?? false)) where.push('s.is_active = 1');
    const base = `SELECT * FROM (${SUPPLIER_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}) x`;
    const filter = queryBool(req.query, 'withBalance') ? 'WHERE x.balance != 0' : '';
    const sort = queryString(req.query, 'sort') === 'balance' ? 'x.balance DESC' : 'x.name COLLATE NOCASE';
    const total = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM (${base} ${filter})`, params)!.n;
    const data = all<Supplier>(db, `${base} ${filter} ORDER BY ${sort} LIMIT @limit OFFSET @offset`, {
      ...params,
      limit: pageSize,
      offset,
    }).map((s) => ({ ...s, isActive: !!s.isActive }));
    res.json({ data, total, page, pageSize } satisfies Paginated<Supplier>);
  });

  router.get('/:id', requirePermission('suppliers.view'), (req, res) => {
    res.json(get(idParam(req)));
  });

  router.post('/', requirePermission('suppliers.manage'), (req, res) => {
    const body = parse(supplierSchema, req.body);
    const now = nowLocal();
    const id = tx(db, () => {
      const r = run(
        db,
        `INSERT INTO suppliers (name, company, phone, email, address, city, ntn, strn, opening_balance, notes,
           is_active, created_at, updated_at)
         VALUES (@name, @company, @phone, @email, @address, @city, @ntn, @strn, @openingBalance, @notes,
           @isActive, @now, @now)`,
        { ...body, now },
      );
      audit(db, actorOf(req), 'supplier.create', 'supplier', r.lastInsertRowid, { name: body.name });
      return Number(r.lastInsertRowid);
    });
    res.status(201).json(get(id));
  });

  router.put('/:id', requirePermission('suppliers.manage'), (req, res) => {
    const id = idParam(req);
    const body = parse(supplierSchema, req.body);
    tx(db, () => {
      const r = run(
        db,
        `UPDATE suppliers SET name = @name, company = @company, phone = @phone, email = @email, address = @address,
           city = @city, ntn = @ntn, strn = @strn, opening_balance = @openingBalance, notes = @notes,
           is_active = @isActive, updated_at = @now WHERE id = @id`,
        { ...body, id, now: nowLocal() },
      );
      if (r.changes === 0) throw notFound('Supplier');
      audit(db, actorOf(req), 'supplier.update', 'supplier', id, { name: body.name });
    });
    res.json(get(id));
  });

  router.delete('/:id', requirePermission('suppliers.manage'), (req, res) => {
    const id = idParam(req);
    tx(db, () => {
      const used =
        one(db, 'SELECT 1 FROM supplier_ledger WHERE supplier_id = ? LIMIT 1', [id]) ??
        one(db, 'SELECT 1 FROM purchases WHERE supplier_id = ? LIMIT 1', [id]);
      if (used) throw conflict('This supplier has transactions and cannot be deleted. Deactivate instead.');
      run(db, 'UPDATE products SET supplier_id = NULL WHERE supplier_id = ?', [id]);
      const r = run(db, 'DELETE FROM suppliers WHERE id = ?', [id]);
      if (r.changes === 0) throw notFound('Supplier');
      audit(db, actorOf(req), 'supplier.delete', 'supplier', id);
    });
    res.json({ ok: true });
  });

  router.get('/:id/statement', requirePermission('suppliers.view'), (req, res) => {
    res.json(statement(db, 'supplier', idParam(req), queryDay(req.query, 'from'), queryDay(req.query, 'to')));
  });

  router.post('/:id/payments', requirePermission('suppliers.pay'), (req, res) => {
    const id = idParam(req);
    const body = parse(paymentSchema, req.body);
    const actor = actorOf(req);
    const result = tx(db, () => {
      const supplier = get(id);
      const at = nowLocal();
      const paymentDate = body.paymentDate ? withCurrentTime(body.paymentDate) : at;
      const p = recordPayment(db, {
        direction: 'out',
        partyType: 'supplier',
        supplierId: id,
        method: body.method,
        amount: body.amount,
        reference: body.reference,
        paymentDate,
        notes: body.notes,
        userId: actor.id,
        at,
      });
      postSupplierLedger(db, {
        partyId: id,
        entryDate: paymentDate,
        entryType: 'payment',
        referenceType: 'payment',
        referenceId: p.id,
        referenceNo: p.paymentNo,
        description: `Payment made (${body.method.replace('_', ' ')})${body.reference ? ` Ref: ${body.reference}` : ''}`,
        debit: body.amount,
        userId: actor.id,
        at,
      });
      audit(db, actor, 'supplier.payment', 'payment', p.id, { supplier: supplier.name, amount: body.amount });
      return { ...p, balance: supplierBalance(db, id) };
    });
    res.status(201).json(result);
  });

  router.post('/:id/adjustments', requirePermission('payments.void'), (req, res) => {
    const id = idParam(req);
    const body = parse(adjustmentSchema, req.body);
    const actor = actorOf(req);
    const balance = tx(db, () => {
      get(id);
      const at = nowLocal();
      postSupplierLedger(db, {
        partyId: id,
        entryDate: at,
        entryType: 'adjustment',
        referenceType: 'adjustment',
        description: `Balance adjustment: ${body.reason}`,
        credit: body.direction === 'increase' ? body.amount : 0,
        debit: body.direction === 'decrease' ? body.amount : 0,
        userId: actor.id,
        at,
      });
      audit(db, actor, 'supplier.adjustment', 'supplier', id, body);
      return supplierBalance(db, id);
    });
    res.status(201).json({ balance });
  });

  return router;
}
