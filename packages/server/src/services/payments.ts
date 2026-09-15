import type { PaymentMethod } from '@pos/shared';
import { run, type DB } from '../db';
import { nextNumber } from '../lib/sequences';

export interface NewPayment {
  direction: 'in' | 'out';
  partyType: 'customer' | 'supplier' | 'walk_in';
  customerId?: number | null;
  supplierId?: number | null;
  saleId?: number | null;
  saleReturnId?: number | null;
  purchaseId?: number | null;
  purchaseReturnId?: number | null;
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
  paymentDate: string;
  notes?: string | null;
  userId: number;
  at: string;
}

export function recordPayment(db: DB, p: NewPayment): { id: number; paymentNo: string } {
  const paymentNo = nextNumber(db, p.direction === 'in' ? 'receipt' : 'voucher');
  const res = run(
    db,
    `INSERT INTO payments (payment_no, direction, party_type, customer_id, supplier_id, sale_id, sale_return_id,
       purchase_id, purchase_return_id, method, amount, reference, payment_date, notes, created_by, created_at)
     VALUES (@paymentNo, @direction, @partyType, @customerId, @supplierId, @saleId, @saleReturnId,
       @purchaseId, @purchaseReturnId, @method, @amount, @reference, @paymentDate, @notes, @userId, @at)`,
    {
      paymentNo,
      direction: p.direction,
      partyType: p.partyType,
      customerId: p.customerId ?? null,
      supplierId: p.supplierId ?? null,
      saleId: p.saleId ?? null,
      saleReturnId: p.saleReturnId ?? null,
      purchaseId: p.purchaseId ?? null,
      purchaseReturnId: p.purchaseReturnId ?? null,
      method: p.method,
      amount: Math.round(p.amount),
      reference: p.reference ?? null,
      paymentDate: p.paymentDate,
      notes: p.notes ?? null,
      userId: p.userId,
      at: p.at,
    },
  );
  return { id: Number(res.lastInsertRowid), paymentNo };
}
