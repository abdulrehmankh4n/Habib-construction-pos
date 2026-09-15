import { z } from 'zod';
import {
  PAYMENT_METHODS,
  PRICE_TIERS,
  REFUND_METHODS,
  proportional,
  roundQty,
  type Payment,
  type Sale,
  type SaleItem,
  type SaleReturn,
  type SaleReturnItem,
  type SaleReturnSummary,
} from '@pos/shared';
import { all, one, run, type DB } from '../db';
import type { AuthUser } from '../context';
import { audit, type Actor } from '../lib/audit';
import { badRequest, notFound, unprocessable } from '../lib/errors';
import { zs } from '../lib/http';
import { nextNumber } from '../lib/sequences';
import { getSettings } from '../lib/settings';
import { nowLocal } from '../lib/time';
import { customerBalance, postCustomerLedger } from './ledger';
import { recordPayment } from './payments';
import { prepareCart } from './pricing';
import { applyStockChange } from './stock';

export const cartItemSchema = z.object({
  productId: zs.id,
  unitId: zs.id,
  qty: zs.qty,
  unitPrice: zs.money,
  discount: zs.money.default(0),
});

export const saleInputSchema = z.object({
  customerId: zs.optId,
  customerName: zs.text(120),
  customerPhone: zs.phone,
  priceTier: z.enum(PRICE_TIERS).default('retail'),
  items: z.array(cartItemSchema).min(1, 'Add at least one item').max(300),
  billDiscount: zs.money.default(0),
  deliveryCharges: zs.money.default(0),
  labourCharges: zs.money.default(0),
  payments: z
    .array(z.object({ method: z.enum(PAYMENT_METHODS), amount: zs.money, reference: zs.text(120) }))
    .max(8)
    .default([]),
  delivery: z
    .object({
      required: z.boolean().default(false),
      address: zs.text(300),
      vehicleNo: zs.text(30),
      driverName: zs.text(80),
      driverPhone: zs.phone,
    })
    .optional(),
  notes: zs.text(500),
  quotationId: zs.optId,
  heldBillId: zs.optId,
});
export type SaleInput = z.infer<typeof saleInputSchema>;

export const returnInputSchema = z.object({
  items: z
    .array(z.object({ saleItemId: zs.id, qty: zs.qty, restock: z.boolean().default(true) }))
    .min(1, 'Select at least one item to return'),
  refundMethod: z.enum(REFUND_METHODS),
  reason: zs.text(300),
  notes: zs.text(500),
});
export type ReturnInput = z.infer<typeof returnInputSchema>;

interface CustomerRow {
  id: number;
  name: string;
  phone: string | null;
  credit_limit: number | null;
  is_active: number;
}

function formatRs(paisa: number): string {
  return `Rs ${(paisa / 100).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

export function createSale(db: DB, input: SaleInput, user: AuthUser, actor: Actor): number {
  const settings = getSettings(db);
  const { lines, totals } = prepareCart(db, input, settings, user);
  const now = nowLocal();

  let customer: CustomerRow | undefined;
  if (input.customerId) {
    customer = one<CustomerRow>(db, 'SELECT id, name, phone, credit_limit, is_active FROM customers WHERE id = ?', [
      input.customerId,
    ]);
    if (!customer) throw badRequest('Customer not found');
    if (!customer.is_active) throw unprocessable('This customer account is inactive');
  }

  const required = new Map<number, { name: string; qty: number; stock: number; track: boolean; symbol: string }>();
  for (const l of lines) {
    const entry = required.get(l.product.id) ?? {
      name: l.product.name,
      qty: 0,
      stock: l.product.stockQty,
      track: l.product.trackStock,
      symbol: l.product.unitSymbol,
    };
    entry.qty = roundQty(entry.qty + l.baseQty);
    required.set(l.product.id, entry);
  }
  if (!settings.sales.allowNegativeStock) {
    const short = [...required.values()].filter((r) => r.track && r.qty > roundQty(r.stock) + 1e-9);
    if (short.length) {
      throw unprocessable(
        `Insufficient stock: ${short.map((s) => `${s.name} (available ${roundQty(s.stock)} ${s.symbol}, required ${s.qty} ${s.symbol})`).join('; ')}`,
        short,
      );
    }
  }

  const payments = input.payments.filter((p) => p.amount > 0).map((p) => ({ ...p }));
  const tendered = payments.reduce((s, p) => s + p.amount, 0);
  const cashTendered = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
  let changeDue = 0;
  if (tendered > totals.grandTotal) {
    changeDue = tendered - totals.grandTotal;
    if (cashTendered < changeDue) {
      throw badRequest('Card, bank and wallet payments cannot exceed the bill total. Only cash can have change.');
    }
    let remaining = changeDue;
    for (let i = payments.length - 1; i >= 0 && remaining > 0; i--) {
      if (payments[i].method !== 'cash') continue;
      const reduce = Math.min(payments[i].amount, remaining);
      payments[i].amount -= reduce;
      remaining -= reduce;
    }
  }
  const applied = payments.filter((p) => p.amount > 0);
  const paidAmount = applied.reduce((s, p) => s + p.amount, 0);
  const balanceDue = totals.grandTotal - paidAmount;

  if (balanceDue > 0) {
    if (!customer) {
      throw unprocessable('Payment is less than the bill total. Select a registered customer to record the balance as credit (udhaar).');
    }
    if (!settings.sales.allowCredit) throw unprocessable('Credit sales are disabled in settings');
    if (customer.credit_limit !== null && !user.permissions.includes('sales.exceed_credit')) {
      const current = customerBalance(db, customer.id);
      if (current + balanceDue > customer.credit_limit) {
        throw unprocessable(
          `Credit limit exceeded for ${customer.name}. Limit ${formatRs(customer.credit_limit)}, current balance ${formatRs(current)}, this bill adds ${formatRs(balanceDue)}.`,
        );
      }
    }
  }

  if (input.quotationId) {
    const q = one<{ status: string }>(db, 'SELECT status FROM quotations WHERE id = ?', [input.quotationId]);
    if (!q) throw badRequest('Quotation not found');
    if (q.status !== 'open') throw unprocessable('This quotation has already been converted or cancelled');
  }

  const delivery = input.delivery?.required ? input.delivery : null;
  const invoiceNo = nextNumber(db, 'sale');
  const costTotal = lines.reduce((s, l) => s + Math.round(l.baseQty * (l.product.costPrice ?? 0)), 0);

  const saleRes = run(
    db,
    `INSERT INTO sales (invoice_no, sale_date, customer_id, customer_name, customer_phone, status, price_tier,
       subtotal, item_discount, bill_discount, taxable_value, tax_total, delivery_charges, labour_charges, round_off,
       grand_total, paid_amount, balance_due, cash_tendered, change_due, cost_total, prices_include_tax,
       delivery_required, delivery_status, delivery_address, vehicle_no, driver_name, driver_phone,
       notes, quotation_id, fbr_status, created_by, created_at, updated_at)
     VALUES (@invoiceNo, @now, @customerId, @customerName, @customerPhone, 'completed', @priceTier,
       @subtotal, @itemDiscount, @billDiscount, @taxableValue, @taxTotal, @deliveryCharges, @labourCharges, @roundOff,
       @grandTotal, @paidAmount, @balanceDue, @cashTendered, @changeDue, @costTotal, @pricesIncludeTax,
       @deliveryRequired, @deliveryStatus, @deliveryAddress, @vehicleNo, @driverName, @driverPhone,
       @notes, @quotationId, @fbrStatus, @userId, @now, @now)`,
    {
      invoiceNo,
      now,
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
      paidAmount,
      balanceDue,
      cashTendered,
      changeDue,
      costTotal,
      pricesIncludeTax: settings.tax.pricesIncludeTax,
      deliveryRequired: !!delivery,
      deliveryStatus: delivery ? 'pending' : null,
      deliveryAddress: delivery?.address ?? null,
      vehicleNo: delivery?.vehicleNo ?? null,
      driverName: delivery?.driverName ?? null,
      driverPhone: delivery?.driverPhone ?? null,
      notes: input.notes,
      quotationId: input.quotationId ?? null,
      fbrStatus: settings.fbr.enabled ? 'pending' : 'not_applicable',
      userId: user.id,
    },
  );
  const saleId = Number(saleRes.lastInsertRowid);

  lines.forEach((l, i) => {
    const t = totals.lines[i];
    run(
      db,
      `INSERT INTO sale_items (sale_id, product_id, product_name, urdu_name, sku, unit_id, unit_name, unit_factor, qty,
         base_qty, unit_price, discount, bill_discount_share, tax_rate, taxable_value, tax_amount, line_total,
         cost_price, hs_code)
       VALUES (@saleId, @productId, @productName, @urduName, @sku, @unitId, @unitName, @factor, @qty,
         @baseQty, @unitPrice, @discount, @share, @taxRate, @taxableValue, @taxAmount, @lineTotal,
         @costPrice, @hsCode)`,
      {
        saleId,
        productId: l.product.id,
        productName: l.product.name,
        urduName: l.product.urduName,
        sku: l.product.sku,
        unitId: l.unit.unitId,
        unitName: l.unit.unitName,
        factor: l.unit.factor,
        qty: l.qty,
        baseQty: l.baseQty,
        unitPrice: l.unitPrice,
        discount: t.discount,
        share: t.billDiscountShare,
        taxRate: t.taxRate,
        taxableValue: t.taxableValue,
        taxAmount: t.taxAmount,
        lineTotal: t.total,
        costPrice: l.product.costPrice ?? 0,
        hsCode: l.product.hsCode,
      },
    );
    if (l.product.trackStock) {
      applyStockChange(db, {
        productId: l.product.id,
        qtyChange: -l.baseQty,
        type: 'sale',
        unitCost: l.product.costPrice ?? 0,
        referenceType: 'sale',
        referenceId: saleId,
        referenceNo: invoiceNo,
        userId: user.id,
        at: now,
      });
    }
  });

  if (customer) {
    postCustomerLedger(db, {
      partyId: customer.id,
      entryDate: now,
      entryType: 'sale',
      referenceType: 'sale',
      referenceId: saleId,
      referenceNo: invoiceNo,
      description: `Sale invoice ${invoiceNo}`,
      debit: totals.grandTotal,
      userId: user.id,
      at: now,
    });
  }

  for (const p of applied) {
    const payment = recordPayment(db, {
      direction: 'in',
      partyType: customer ? 'customer' : 'walk_in',
      customerId: customer?.id ?? null,
      saleId,
      method: p.method,
      amount: p.amount,
      reference: p.reference,
      paymentDate: now,
      userId: user.id,
      at: now,
    });
    if (customer) {
      postCustomerLedger(db, {
        partyId: customer.id,
        entryDate: now,
        entryType: 'payment',
        referenceType: 'payment',
        referenceId: payment.id,
        referenceNo: payment.paymentNo,
        description: `Payment against ${invoiceNo} (${p.method.replace('_', ' ')})`,
        credit: p.amount,
        userId: user.id,
        at: now,
      });
    }
  }

  if (input.quotationId) {
    run(db, "UPDATE quotations SET status = 'converted', sale_id = ?, updated_at = ? WHERE id = ?", [
      saleId,
      now,
      input.quotationId,
    ]);
  }
  if (input.heldBillId) run(db, 'DELETE FROM held_bills WHERE id = ?', [input.heldBillId]);

  audit(db, actor, 'sale.create', 'sale', saleId, {
    invoiceNo,
    total: totals.grandTotal,
    paid: paidAmount,
    credit: balanceDue,
  });
  return saleId;
}

const SALE_SELECT = `SELECT s.id, s.invoice_no AS invoiceNo, s.sale_date AS saleDate, s.customer_id AS customerId,
  s.customer_name AS customerName, s.customer_phone AS customerPhone, s.status, s.price_tier AS priceTier,
  s.subtotal, s.item_discount AS itemDiscount, s.bill_discount AS billDiscount, s.taxable_value AS taxableValue,
  s.tax_total AS taxTotal, s.delivery_charges AS deliveryCharges, s.labour_charges AS labourCharges,
  s.round_off AS roundOff, s.grand_total AS grandTotal, s.paid_amount AS paidAmount, s.balance_due AS balanceDue,
  s.cash_tendered AS cashTendered, s.change_due AS changeDue, s.cost_total AS costTotal,
  s.prices_include_tax AS pricesIncludeTax, s.delivery_required AS deliveryRequired,
  s.delivery_status AS deliveryStatus, s.delivery_address AS deliveryAddress, s.vehicle_no AS vehicleNo,
  s.driver_name AS driverName, s.driver_phone AS driverPhone, s.delivered_at AS deliveredAt, s.notes,
  s.quotation_id AS quotationId, s.fbr_status AS fbrStatus, s.fbr_invoice_no AS fbrInvoiceNo, s.fbr_error AS fbrError,
  s.created_by AS createdBy, u.full_name AS createdByName, s.voided_at AS voidedAt, s.void_reason AS voidReason,
  COALESCE((SELECT SUM(r.total_amount) FROM sale_returns r WHERE r.sale_id = s.id), 0) AS returnedTotal,
  (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id) AS itemCount,
  s.created_at AS createdAt
FROM sales s LEFT JOIN users u ON u.id = s.created_by`;

export { SALE_SELECT };

export function mapSale(row: Sale, showCost: boolean): Sale {
  const s: Sale = {
    ...row,
    pricesIncludeTax: !!row.pricesIncludeTax,
    deliveryRequired: !!row.deliveryRequired,
  };
  if (!showCost) delete s.costTotal;
  return s;
}

export const PAYMENT_SELECT = `SELECT p.id, p.payment_no AS paymentNo, p.direction, p.party_type AS partyType,
  p.customer_id AS customerId, p.supplier_id AS supplierId,
  COALESCE(c.name, s.name, sa.customer_name) AS partyName,
  p.sale_id AS saleId, p.sale_return_id AS saleReturnId, p.purchase_id AS purchaseId,
  p.purchase_return_id AS purchaseReturnId, p.method, p.amount, p.reference, p.payment_date AS paymentDate,
  p.notes, p.is_void AS isVoid, p.void_reason AS voidReason, u.full_name AS createdByName, p.created_at AS createdAt
FROM payments p
LEFT JOIN customers c ON c.id = p.customer_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN sales sa ON sa.id = p.sale_id
LEFT JOIN users u ON u.id = p.created_by`;

export function mapPayment(p: Payment): Payment {
  return { ...p, isVoid: !!p.isVoid };
}

export function getSale(db: DB, id: number, showCost: boolean): Sale {
  const row = one<Sale>(db, `${SALE_SELECT} WHERE s.id = ?`, [id]);
  if (!row) throw notFound('Sale');
  const sale = mapSale(row, showCost);
  sale.items = all<SaleItem>(
    db,
    `SELECT i.id, i.product_id AS productId, i.product_name AS productName, i.urdu_name AS urduName, i.sku,
       i.unit_id AS unitId, i.unit_name AS unitName, i.unit_factor AS unitFactor, i.qty, i.base_qty AS baseQty,
       i.unit_price AS unitPrice, i.discount, i.bill_discount_share AS billDiscountShare, i.tax_rate AS taxRate,
       i.taxable_value AS taxableValue, i.tax_amount AS taxAmount, i.line_total AS lineTotal,
       i.cost_price AS costPrice, i.hs_code AS hsCode,
       COALESCE((SELECT SUM(ri.qty) FROM sale_return_items ri WHERE ri.sale_item_id = i.id), 0) AS returnedQty
     FROM sale_items i WHERE i.sale_id = ? ORDER BY i.id`,
    [id],
  ).map((i) => {
    if (!showCost) delete i.costPrice;
    return i;
  });
  sale.payments = all<Payment>(db, `${PAYMENT_SELECT} WHERE p.sale_id = ? ORDER BY p.id`, [id]).map(mapPayment);
  sale.returns = all<SaleReturnSummary>(
    db,
    `SELECT id, return_no AS returnNo, return_date AS returnDate, total_amount AS totalAmount,
       refund_method AS refundMethod FROM sale_returns WHERE sale_id = ? ORDER BY id`,
    [id],
  );
  if (sale.customerId) {
    const c = one<{ address: string | null; ntn: string | null }>(
      db,
      'SELECT address, ntn FROM customers WHERE id = ?',
      [sale.customerId],
    );
    sale.customerAddress = c?.address ?? null;
    sale.customerNtn = c?.ntn ?? null;
    sale.customerBalance = customerBalance(db, sale.customerId);
  } else {
    sale.customerBalance = null;
  }
  return sale;
}

export function voidSale(db: DB, saleId: number, reason: string, user: AuthUser, actor: Actor) {
  const sale = one<{
    id: number;
    invoice_no: string;
    status: string;
    customer_id: number | null;
    grand_total: number;
    quotation_id: number | null;
  }>(db, 'SELECT id, invoice_no, status, customer_id, grand_total, quotation_id FROM sales WHERE id = ?', [saleId]);
  if (!sale) throw notFound('Sale');
  if (sale.status === 'void') throw unprocessable('This sale is already cancelled');
  if (one(db, 'SELECT 1 FROM sale_returns WHERE sale_id = ? LIMIT 1', [saleId])) {
    throw unprocessable('This sale has returns recorded against it and cannot be cancelled');
  }
  const now = nowLocal();

  const items = all<{ product_id: number; base_qty: number; cost_price: number; track_stock: number }>(
    db,
    `SELECT i.product_id, i.base_qty, i.cost_price, p.track_stock FROM sale_items i
     JOIN products p ON p.id = i.product_id WHERE i.sale_id = ?`,
    [saleId],
  );
  for (const i of items) {
    if (!i.track_stock) continue;
    applyStockChange(db, {
      productId: i.product_id,
      qtyChange: i.base_qty,
      type: 'sale_void',
      unitCost: i.cost_price,
      costMode: 'add',
      referenceType: 'sale',
      referenceId: saleId,
      referenceNo: sale.invoice_no,
      note: `Cancelled: ${reason}`,
      userId: user.id,
      at: now,
    });
  }

  const payments = all<{ id: number; payment_no: string; amount: number }>(
    db,
    'SELECT id, payment_no, amount FROM payments WHERE sale_id = ? AND is_void = 0',
    [saleId],
  );
  run(
    db,
    'UPDATE payments SET is_void = 1, voided_by = ?, voided_at = ?, void_reason = ? WHERE sale_id = ? AND is_void = 0',
    [user.id, now, `Sale cancelled: ${reason}`, saleId],
  );

  if (sale.customer_id) {
    postCustomerLedger(db, {
      partyId: sale.customer_id,
      entryDate: now,
      entryType: 'sale_void',
      referenceType: 'sale',
      referenceId: saleId,
      referenceNo: sale.invoice_no,
      description: `Invoice ${sale.invoice_no} cancelled`,
      credit: sale.grand_total,
      userId: user.id,
      at: now,
    });
    for (const p of payments) {
      postCustomerLedger(db, {
        partyId: sale.customer_id,
        entryDate: now,
        entryType: 'payment_void',
        referenceType: 'payment',
        referenceId: p.id,
        referenceNo: p.payment_no,
        description: `Payment ${p.payment_no} reversed (invoice cancelled)`,
        debit: p.amount,
        userId: user.id,
        at: now,
      });
    }
  }

  run(
    db,
    `UPDATE sales SET status = 'void', voided_by = ?, voided_at = ?, void_reason = ?,
       delivery_status = CASE WHEN delivery_status IN ('pending','dispatched') THEN 'cancelled' ELSE delivery_status END,
       updated_at = ? WHERE id = ?`,
    [user.id, now, reason, now, saleId],
  );
  if (sale.quotation_id) {
    run(db, "UPDATE quotations SET status = 'open', sale_id = NULL, updated_at = ? WHERE id = ?", [
      now,
      sale.quotation_id,
    ]);
  }
  audit(db, actor, 'sale.void', 'sale', saleId, { invoiceNo: sale.invoice_no, reason });
}

export function createSaleReturn(db: DB, saleId: number, input: ReturnInput, user: AuthUser, actor: Actor): number {
  const sale = one<{ id: number; invoice_no: string; status: string; customer_id: number | null }>(
    db,
    'SELECT id, invoice_no, status, customer_id FROM sales WHERE id = ?',
    [saleId],
  );
  if (!sale) throw notFound('Sale');
  if (sale.status !== 'completed') throw unprocessable('Returns can only be made against completed sales');
  if (input.refundMethod === 'account' && !sale.customer_id) {
    throw unprocessable('Walk-in sales must be refunded with a payment method (e.g. cash)');
  }

  const seen = new Set<number>();
  const now = nowLocal();
  const prepared = input.items.map((ri) => {
    if (seen.has(ri.saleItemId)) throw badRequest('Each item can only be listed once');
    seen.add(ri.saleItemId);
    const item = one<{
      id: number;
      product_id: number;
      product_name: string;
      qty: number;
      unit_factor: number;
      line_total: number;
      tax_amount: number;
      cost_price: number;
      allow_decimal: number;
      track_stock: number;
    }>(
      db,
      `SELECT i.id, i.product_id, i.product_name, i.qty, i.unit_factor, i.line_total, i.tax_amount, i.cost_price,
         u.allow_decimal, p.track_stock
       FROM sale_items i JOIN units u ON u.id = i.unit_id JOIN products p ON p.id = i.product_id
       WHERE i.id = ? AND i.sale_id = ?`,
      [ri.saleItemId, saleId],
    );
    if (!item) throw badRequest('Item does not belong to this sale');
    const prev = one<{ qty: number; amount: number; tax: number }>(
      db,
      `SELECT COALESCE(SUM(qty), 0) AS qty, COALESCE(SUM(amount), 0) AS amount, COALESCE(SUM(tax_amount), 0) AS tax
       FROM sale_return_items WHERE sale_item_id = ?`,
      [item.id],
    )!;
    const available = roundQty(item.qty - prev.qty);
    const qty = roundQty(ri.qty);
    if (!item.allow_decimal && !Number.isInteger(qty)) {
      throw badRequest(`${item.product_name}: return quantity must be a whole number`);
    }
    if (qty > available + 1e-9) {
      throw unprocessable(`${item.product_name}: only ${available} can be returned`);
    }
    const isFinal = Math.abs(qty - available) < 1e-9;
    const amount = isFinal ? item.line_total - prev.amount : proportional(item.line_total, qty, item.qty);
    const tax = isFinal ? item.tax_amount - prev.tax : proportional(item.tax_amount, qty, item.qty);
    return {
      item,
      qty,
      baseQty: roundQty(qty * item.unit_factor),
      amount,
      tax,
      restock: ri.restock,
    };
  });

  const totalAmount = prepared.reduce((s, p) => s + p.amount, 0);
  const taxTotal = prepared.reduce((s, p) => s + p.tax, 0);
  const costTotal = prepared
    .filter((p) => p.restock)
    .reduce((s, p) => s + Math.round(p.baseQty * p.item.cost_price), 0);
  const refundAmount = input.refundMethod === 'account' ? 0 : totalAmount;
  const returnNo = nextNumber(db, 'sale_return');

  const res = run(
    db,
    `INSERT INTO sale_returns (return_no, sale_id, customer_id, return_date, total_amount, tax_total, cost_total,
       refund_method, refund_amount, reason, notes, created_by, created_at)
     VALUES (@returnNo, @saleId, @customerId, @now, @totalAmount, @taxTotal, @costTotal,
       @refundMethod, @refundAmount, @reason, @notes, @userId, @now)`,
    {
      returnNo,
      saleId,
      customerId: sale.customer_id,
      now,
      totalAmount,
      taxTotal,
      costTotal,
      refundMethod: input.refundMethod,
      refundAmount,
      reason: input.reason,
      notes: input.notes,
      userId: user.id,
    },
  );
  const returnId = Number(res.lastInsertRowid);

  for (const p of prepared) {
    run(
      db,
      `INSERT INTO sale_return_items (sale_return_id, sale_item_id, product_id, qty, base_qty, amount, tax_amount,
         cost_price, restock)
       VALUES (@returnId, @saleItemId, @productId, @qty, @baseQty, @amount, @tax, @cost, @restock)`,
      {
        returnId,
        saleItemId: p.item.id,
        productId: p.item.product_id,
        qty: p.qty,
        baseQty: p.baseQty,
        amount: p.amount,
        tax: p.tax,
        cost: p.item.cost_price,
        restock: p.restock,
      },
    );
    if (p.restock && p.item.track_stock) {
      applyStockChange(db, {
        productId: p.item.product_id,
        qtyChange: p.baseQty,
        type: 'sale_return',
        unitCost: p.item.cost_price,
        costMode: 'add',
        referenceType: 'sale_return',
        referenceId: returnId,
        referenceNo: returnNo,
        note: `Return against ${sale.invoice_no}`,
        userId: user.id,
        at: now,
      });
    }
  }

  if (sale.customer_id) {
    postCustomerLedger(db, {
      partyId: sale.customer_id,
      entryDate: now,
      entryType: 'sale_return',
      referenceType: 'sale_return',
      referenceId: returnId,
      referenceNo: returnNo,
      description: `Goods returned against ${sale.invoice_no}`,
      credit: totalAmount,
      userId: user.id,
      at: now,
    });
  }

  if (refundAmount > 0 && input.refundMethod !== 'account') {
    const payment = recordPayment(db, {
      direction: 'out',
      partyType: sale.customer_id ? 'customer' : 'walk_in',
      customerId: sale.customer_id,
      saleId,
      saleReturnId: returnId,
      method: input.refundMethod,
      amount: refundAmount,
      paymentDate: now,
      notes: `Refund for ${returnNo}`,
      userId: user.id,
      at: now,
    });
    if (sale.customer_id) {
      postCustomerLedger(db, {
        partyId: sale.customer_id,
        entryDate: now,
        entryType: 'refund',
        referenceType: 'payment',
        referenceId: payment.id,
        referenceNo: payment.paymentNo,
        description: `Refund paid for ${returnNo} (${input.refundMethod.replace('_', ' ')})`,
        debit: refundAmount,
        userId: user.id,
        at: now,
      });
    }
  }

  audit(db, actor, 'sale.return', 'sale_return', returnId, { returnNo, invoiceNo: sale.invoice_no, totalAmount });
  return returnId;
}

export function getSaleReturn(db: DB, id: number): SaleReturn {
  const row = one<SaleReturn>(
    db,
    `SELECT r.id, r.return_no AS returnNo, r.sale_id AS saleId, s.invoice_no AS invoiceNo, r.customer_id AS customerId,
       COALESCE(c.name, s.customer_name) AS customerName, r.return_date AS returnDate, r.total_amount AS totalAmount,
       r.tax_total AS taxTotal, r.refund_method AS refundMethod, r.refund_amount AS refundAmount, r.reason, r.notes,
       u.full_name AS createdByName, r.created_at AS createdAt
     FROM sale_returns r JOIN sales s ON s.id = r.sale_id
     LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN users u ON u.id = r.created_by
     WHERE r.id = ?`,
    [id],
  );
  if (!row) throw notFound('Sale return');
  row.items = all<SaleReturnItem>(
    db,
    `SELECT ri.id, ri.sale_item_id AS saleItemId, ri.product_id AS productId, i.product_name AS productName,
       i.unit_name AS unitName, ri.qty, ri.base_qty AS baseQty, ri.amount, ri.tax_amount AS taxAmount, ri.restock
     FROM sale_return_items ri JOIN sale_items i ON i.id = ri.sale_item_id
     WHERE ri.sale_return_id = ? ORDER BY ri.id`,
    [id],
  ).map((i) => ({ ...i, restock: !!i.restock }));
  return row;
}
