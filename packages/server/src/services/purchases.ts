import { z } from 'zod';
import {
  PAYMENT_METHODS,
  REFUND_METHODS,
  allocate,
  lineGross,
  proportional,
  resolveUnit,
  roundQty,
  type Payment,
  type Purchase,
  type PurchaseItem,
  type PurchaseReturn,
} from '@pos/shared';
import { all, one, run, type DB } from '../db';
import type { AuthUser } from '../context';
import { audit, type Actor } from '../lib/audit';
import { badRequest, notFound, unprocessable } from '../lib/errors';
import { zs } from '../lib/http';
import { nextNumber } from '../lib/sequences';
import { getSettings } from '../lib/settings';
import { nowLocal, todayLocal, withCurrentTime } from '../lib/time';
import { postSupplierLedger } from './ledger';
import { recordPayment } from './payments';
import { getProduct } from './products';
import { mapPayment, PAYMENT_SELECT } from './sales';
import { applyStockChange } from './stock';

export const purchaseInputSchema = z.object({
  supplierId: zs.id,
  supplierInvoiceNo: zs.text(60),
  purchaseDate: zs.day.optional(),
  items: z
    .array(
      z.object({
        productId: zs.id,
        unitId: zs.id,
        qty: zs.qty,
        unitCost: zs.money,
        discount: zs.money.default(0),
        newSalePrice: zs.optMoney,
      }),
    )
    .min(1, 'Add at least one item')
    .max(300),
  billDiscount: zs.money.default(0),
  taxAmount: zs.money.default(0),
  freightCharges: zs.money.default(0),
  otherCharges: zs.money.default(0),
  vehicleNo: zs.text(30),
  notes: zs.text(1000),
  payments: z
    .array(z.object({ method: z.enum(PAYMENT_METHODS), amount: zs.money, reference: zs.text(120) }))
    .max(6)
    .default([]),
});
export type PurchaseInput = z.infer<typeof purchaseInputSchema>;

export const purchaseReturnSchema = z.object({
  items: z.array(z.object({ purchaseItemId: zs.id, qty: zs.qty })).min(1, 'Select at least one item'),
  refundMethod: z.enum(REFUND_METHODS),
  reason: zs.text(300),
  notes: zs.text(500),
});
export type PurchaseReturnInput = z.infer<typeof purchaseReturnSchema>;

export function createPurchase(db: DB, input: PurchaseInput, user: AuthUser, actor: Actor): number {
  const supplier = one<{ id: number; name: string; is_active: number }>(
    db,
    'SELECT id, name, is_active FROM suppliers WHERE id = ?',
    [input.supplierId],
  );
  if (!supplier) throw badRequest('Supplier not found');

  const lines = input.items.map((item, idx) => {
    const product = getProduct(db, item.productId, true);
    const unit = resolveUnit(product, item.unitId);
    if (!unit) throw badRequest(`Line ${idx + 1}: unit is not configured for ${product.name}`);
    const qty = roundQty(item.qty);
    if (!unit.allowDecimal && !Number.isInteger(qty)) {
      throw badRequest(`${product.name}: quantity in ${unit.unitName} must be a whole number`);
    }
    const gross = lineGross(qty, item.unitCost);
    if (item.discount > gross) throw badRequest(`${product.name}: discount cannot exceed the line amount`);
    return {
      product,
      unit,
      qty,
      baseQty: roundQty(qty * unit.factor),
      unitCost: item.unitCost,
      gross,
      discount: item.discount,
      net: gross - item.discount,
      newSalePrice: item.newSalePrice ?? null,
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.gross, 0);
  const itemDiscount = lines.reduce((s, l) => s + l.discount, 0);
  const netTotal = subtotal - itemDiscount;
  if (input.billDiscount > netTotal) throw badRequest('Bill discount cannot exceed the purchase amount');
  const grandTotal = netTotal - input.billDiscount + input.taxAmount + input.freightCharges + input.otherCharges;

  const weights = lines.map((l) => l.net);
  const discountShares = allocate(input.billDiscount, weights);
  const chargeShares = allocate(input.freightCharges + input.otherCharges, weights);

  const payments = input.payments.filter((p) => p.amount > 0);
  const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
  if (paidAmount > grandTotal) {
    throw badRequest('Payment exceeds the purchase total. Record advance payments from the supplier page.');
  }

  const now = nowLocal();
  const purchaseDate = input.purchaseDate ? withCurrentTime(input.purchaseDate) : now;
  if (purchaseDate.slice(0, 10) > todayLocal()) throw badRequest('Purchase date cannot be in the future');
  const purchaseNo = nextNumber(db, 'purchase');

  const res = run(
    db,
    `INSERT INTO purchases (purchase_no, supplier_id, supplier_invoice_no, purchase_date, status, subtotal,
       item_discount, bill_discount, tax_amount, freight_charges, other_charges, grand_total, paid_amount,
       vehicle_no, notes, created_by, created_at, updated_at)
     VALUES (@purchaseNo, @supplierId, @supplierInvoiceNo, @purchaseDate, 'completed', @subtotal,
       @itemDiscount, @billDiscount, @taxAmount, @freightCharges, @otherCharges, @grandTotal, @paidAmount,
       @vehicleNo, @notes, @userId, @now, @now)`,
    {
      purchaseNo,
      supplierId: supplier.id,
      supplierInvoiceNo: input.supplierInvoiceNo,
      purchaseDate,
      subtotal,
      itemDiscount,
      billDiscount: input.billDiscount,
      taxAmount: input.taxAmount,
      freightCharges: input.freightCharges,
      otherCharges: input.otherCharges,
      grandTotal,
      paidAmount,
      vehicleNo: input.vehicleNo,
      notes: input.notes,
      userId: user.id,
      now,
    },
  );
  const purchaseId = Number(res.lastInsertRowid);

  lines.forEach((l, i) => {
    const landedTotal = l.net - discountShares[i] + chargeShares[i];
    const landedUnitCost = l.baseQty > 0 ? Math.round(landedTotal / l.baseQty) : 0;
    run(
      db,
      `INSERT INTO purchase_items (purchase_id, product_id, product_name, unit_id, unit_name, unit_factor, qty,
         base_qty, unit_cost, discount, line_total, landed_unit_cost)
       VALUES (@purchaseId, @productId, @productName, @unitId, @unitName, @factor, @qty, @baseQty, @unitCost,
         @discount, @lineTotal, @landed)`,
      {
        purchaseId,
        productId: l.product.id,
        productName: l.product.name,
        unitId: l.unit.unitId,
        unitName: l.unit.unitName,
        factor: l.unit.factor,
        qty: l.qty,
        baseQty: l.baseQty,
        unitCost: l.unitCost,
        discount: l.discount,
        lineTotal: l.net,
        landed: landedUnitCost,
      },
    );
    applyStockChange(db, {
      productId: l.product.id,
      qtyChange: l.baseQty,
      type: 'purchase',
      unitCost: landedUnitCost,
      costMode: 'add',
      purchasePrice: Math.round(l.unitCost / l.unit.factor),
      referenceType: 'purchase',
      referenceId: purchaseId,
      referenceNo: purchaseNo,
      note: `From ${supplier.name}`,
      userId: user.id,
      at: now,
    });
    if (l.newSalePrice !== null && l.newSalePrice !== l.product.salePrice) {
      run(db, 'UPDATE products SET sale_price = ?, updated_at = ? WHERE id = ?', [l.newSalePrice, now, l.product.id]);
      audit(db, actor, 'product.price_change', 'product', l.product.id, {
        from: l.product.salePrice,
        to: l.newSalePrice,
        via: purchaseNo,
      });
    }
  });

  postSupplierLedger(db, {
    partyId: supplier.id,
    entryDate: purchaseDate,
    entryType: 'purchase',
    referenceType: 'purchase',
    referenceId: purchaseId,
    referenceNo: purchaseNo,
    description: `Purchase ${purchaseNo}${input.supplierInvoiceNo ? ` (Bill #${input.supplierInvoiceNo})` : ''}`,
    credit: grandTotal,
    userId: user.id,
    at: now,
  });

  for (const p of payments) {
    const payment = recordPayment(db, {
      direction: 'out',
      partyType: 'supplier',
      supplierId: supplier.id,
      purchaseId,
      method: p.method,
      amount: p.amount,
      reference: p.reference,
      paymentDate: purchaseDate,
      userId: user.id,
      at: now,
    });
    postSupplierLedger(db, {
      partyId: supplier.id,
      entryDate: purchaseDate,
      entryType: 'payment',
      referenceType: 'payment',
      referenceId: payment.id,
      referenceNo: payment.paymentNo,
      description: `Payment against ${purchaseNo} (${p.method.replace('_', ' ')})`,
      debit: p.amount,
      userId: user.id,
      at: now,
    });
  }

  audit(db, actor, 'purchase.create', 'purchase', purchaseId, { purchaseNo, total: grandTotal, paid: paidAmount });
  return purchaseId;
}

export const PURCHASE_SELECT = `SELECT p.id, p.purchase_no AS purchaseNo, p.supplier_id AS supplierId,
  s.name AS supplierName, p.supplier_invoice_no AS supplierInvoiceNo, p.purchase_date AS purchaseDate, p.status,
  p.subtotal, p.item_discount AS itemDiscount, p.bill_discount AS billDiscount, p.tax_amount AS taxAmount,
  p.freight_charges AS freightCharges, p.other_charges AS otherCharges, p.grand_total AS grandTotal,
  p.paid_amount AS paidAmount, p.vehicle_no AS vehicleNo, p.notes,
  COALESCE((SELECT SUM(r.total_amount) FROM purchase_returns r WHERE r.purchase_id = p.id), 0) AS returnedTotal,
  u.full_name AS createdByName, p.voided_at AS voidedAt, p.void_reason AS voidReason, p.created_at AS createdAt
FROM purchases p JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.created_by`;

export function getPurchase(db: DB, id: number): Purchase {
  const row = one<Purchase>(db, `${PURCHASE_SELECT} WHERE p.id = ?`, [id]);
  if (!row) throw notFound('Purchase');
  row.items = all<PurchaseItem>(
    db,
    `SELECT i.id, i.product_id AS productId, i.product_name AS productName, i.unit_id AS unitId,
       i.unit_name AS unitName, i.unit_factor AS unitFactor, i.qty, i.base_qty AS baseQty, i.unit_cost AS unitCost,
       i.discount, i.line_total AS lineTotal, i.landed_unit_cost AS landedUnitCost,
       COALESCE((SELECT SUM(ri.qty) FROM purchase_return_items ri WHERE ri.purchase_item_id = i.id), 0) AS returnedQty
     FROM purchase_items i WHERE i.purchase_id = ? ORDER BY i.id`,
    [id],
  );
  row.payments = all<Payment>(db, `${PAYMENT_SELECT} WHERE p.purchase_id = ? ORDER BY p.id`, [id]).map(mapPayment);
  row.returns = all<PurchaseReturn>(
    db,
    `SELECT r.id, r.return_no AS returnNo, r.purchase_id AS purchaseId, r.supplier_id AS supplierId,
       r.return_date AS returnDate, r.total_amount AS totalAmount, r.refund_method AS refundMethod,
       r.refund_amount AS refundAmount, r.reason, r.notes, u.full_name AS createdByName, r.created_at AS createdAt
     FROM purchase_returns r LEFT JOIN users u ON u.id = r.created_by WHERE r.purchase_id = ? ORDER BY r.id`,
    [id],
  );
  return row;
}

export function voidPurchase(db: DB, id: number, reason: string, user: AuthUser, actor: Actor) {
  const purchase = one<{ id: number; purchase_no: string; status: string; supplier_id: number; grand_total: number }>(
    db,
    'SELECT id, purchase_no, status, supplier_id, grand_total FROM purchases WHERE id = ?',
    [id],
  );
  if (!purchase) throw notFound('Purchase');
  if (purchase.status === 'void') throw unprocessable('This purchase is already cancelled');
  if (one(db, 'SELECT 1 FROM purchase_returns WHERE purchase_id = ? LIMIT 1', [id])) {
    throw unprocessable('This purchase has returns recorded and cannot be cancelled');
  }
  const settings = getSettings(db);
  const now = nowLocal();
  const items = all<{ product_id: number; product_name: string; base_qty: number; landed_unit_cost: number }>(
    db,
    'SELECT product_id, product_name, base_qty, landed_unit_cost FROM purchase_items WHERE purchase_id = ?',
    [id],
  );
  for (const i of items) {
    applyStockChange(db, {
      productId: i.product_id,
      qtyChange: -i.base_qty,
      type: 'purchase_void',
      unitCost: i.landed_unit_cost,
      costMode: 'remove',
      referenceType: 'purchase',
      referenceId: id,
      referenceNo: purchase.purchase_no,
      note: `Cancelled: ${reason}`,
      userId: user.id,
      enforceAvailability: !settings.sales.allowNegativeStock,
      at: now,
    });
  }
  const payments = all<{ id: number; payment_no: string; amount: number }>(
    db,
    'SELECT id, payment_no, amount FROM payments WHERE purchase_id = ? AND is_void = 0',
    [id],
  );
  run(
    db,
    'UPDATE payments SET is_void = 1, voided_by = ?, voided_at = ?, void_reason = ? WHERE purchase_id = ? AND is_void = 0',
    [user.id, now, `Purchase cancelled: ${reason}`, id],
  );
  postSupplierLedger(db, {
    partyId: purchase.supplier_id,
    entryDate: now,
    entryType: 'purchase_void',
    referenceType: 'purchase',
    referenceId: id,
    referenceNo: purchase.purchase_no,
    description: `Purchase ${purchase.purchase_no} cancelled`,
    debit: purchase.grand_total,
    userId: user.id,
    at: now,
  });
  for (const p of payments) {
    postSupplierLedger(db, {
      partyId: purchase.supplier_id,
      entryDate: now,
      entryType: 'payment_void',
      referenceType: 'payment',
      referenceId: p.id,
      referenceNo: p.payment_no,
      description: `Payment ${p.payment_no} reversed (purchase cancelled)`,
      credit: p.amount,
      userId: user.id,
      at: now,
    });
  }
  run(db, "UPDATE purchases SET status = 'void', voided_by = ?, voided_at = ?, void_reason = ?, updated_at = ? WHERE id = ?", [
    user.id,
    now,
    reason,
    now,
    id,
  ]);
  audit(db, actor, 'purchase.void', 'purchase', id, { purchaseNo: purchase.purchase_no, reason });
}

export function createPurchaseReturn(
  db: DB,
  purchaseId: number,
  input: PurchaseReturnInput,
  user: AuthUser,
  actor: Actor,
): number {
  const purchase = one<{ id: number; purchase_no: string; status: string; supplier_id: number }>(
    db,
    'SELECT id, purchase_no, status, supplier_id FROM purchases WHERE id = ?',
    [purchaseId],
  );
  if (!purchase) throw notFound('Purchase');
  if (purchase.status !== 'completed') throw unprocessable('Returns can only be made against completed purchases');
  const settings = getSettings(db);
  const now = nowLocal();
  const seen = new Set<number>();

  const prepared = input.items.map((ri) => {
    if (seen.has(ri.purchaseItemId)) throw badRequest('Each item can only be listed once');
    seen.add(ri.purchaseItemId);
    const item = one<{
      id: number;
      product_id: number;
      product_name: string;
      qty: number;
      unit_factor: number;
      line_total: number;
      landed_unit_cost: number;
      allow_decimal: number;
    }>(
      db,
      `SELECT i.id, i.product_id, i.product_name, i.qty, i.unit_factor, i.line_total, i.landed_unit_cost, u.allow_decimal
       FROM purchase_items i JOIN units u ON u.id = i.unit_id WHERE i.id = ? AND i.purchase_id = ?`,
      [ri.purchaseItemId, purchaseId],
    );
    if (!item) throw badRequest('Item does not belong to this purchase');
    const prev = one<{ qty: number; amount: number }>(
      db,
      'SELECT COALESCE(SUM(qty), 0) AS qty, COALESCE(SUM(amount), 0) AS amount FROM purchase_return_items WHERE purchase_item_id = ?',
      [item.id],
    )!;
    const available = roundQty(item.qty - prev.qty);
    const qty = roundQty(ri.qty);
    if (!item.allow_decimal && !Number.isInteger(qty)) {
      throw badRequest(`${item.product_name}: return quantity must be a whole number`);
    }
    if (qty > available + 1e-9) throw unprocessable(`${item.product_name}: only ${available} can be returned`);
    const isFinal = Math.abs(qty - available) < 1e-9;
    return {
      item,
      qty,
      baseQty: roundQty(qty * item.unit_factor),
      amount: isFinal ? item.line_total - prev.amount : proportional(item.line_total, qty, item.qty),
    };
  });

  const totalAmount = prepared.reduce((s, p) => s + p.amount, 0);
  const refundAmount = input.refundMethod === 'account' ? 0 : totalAmount;
  const returnNo = nextNumber(db, 'purchase_return');
  const res = run(
    db,
    `INSERT INTO purchase_returns (return_no, purchase_id, supplier_id, return_date, total_amount, refund_method,
       refund_amount, reason, notes, created_by, created_at)
     VALUES (@returnNo, @purchaseId, @supplierId, @now, @totalAmount, @refundMethod, @refundAmount, @reason, @notes,
       @userId, @now)`,
    {
      returnNo,
      purchaseId,
      supplierId: purchase.supplier_id,
      now,
      totalAmount,
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
      `INSERT INTO purchase_return_items (purchase_return_id, purchase_item_id, product_id, qty, base_qty, amount, unit_cost)
       VALUES (@returnId, @itemId, @productId, @qty, @baseQty, @amount, @unitCost)`,
      {
        returnId,
        itemId: p.item.id,
        productId: p.item.product_id,
        qty: p.qty,
        baseQty: p.baseQty,
        amount: p.amount,
        unitCost: p.item.landed_unit_cost,
      },
    );
    applyStockChange(db, {
      productId: p.item.product_id,
      qtyChange: -p.baseQty,
      type: 'purchase_return',
      unitCost: p.item.landed_unit_cost,
      costMode: 'remove',
      referenceType: 'purchase_return',
      referenceId: returnId,
      referenceNo: returnNo,
      note: `Returned to supplier (${purchase.purchase_no})`,
      userId: user.id,
      enforceAvailability: !settings.sales.allowNegativeStock,
      at: now,
    });
  }

  postSupplierLedger(db, {
    partyId: purchase.supplier_id,
    entryDate: now,
    entryType: 'purchase_return',
    referenceType: 'purchase_return',
    referenceId: returnId,
    referenceNo: returnNo,
    description: `Goods returned (${purchase.purchase_no})`,
    debit: totalAmount,
    userId: user.id,
    at: now,
  });
  if (refundAmount > 0 && input.refundMethod !== 'account') {
    const payment = recordPayment(db, {
      direction: 'in',
      partyType: 'supplier',
      supplierId: purchase.supplier_id,
      purchaseId,
      purchaseReturnId: returnId,
      method: input.refundMethod,
      amount: refundAmount,
      paymentDate: now,
      notes: `Supplier refund for ${returnNo}`,
      userId: user.id,
      at: now,
    });
    postSupplierLedger(db, {
      partyId: purchase.supplier_id,
      entryDate: now,
      entryType: 'refund',
      referenceType: 'payment',
      referenceId: payment.id,
      referenceNo: payment.paymentNo,
      description: `Refund received for ${returnNo}`,
      credit: refundAmount,
      userId: user.id,
      at: now,
    });
  }
  audit(db, actor, 'purchase.return', 'purchase_return', returnId, { returnNo, totalAmount });
  return returnId;
}
