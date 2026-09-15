import type { LedgerEntry, LedgerStatement } from '@pos/shared';
import { all, one, run, type DB } from '../db';
import { notFound } from '../lib/errors';
import { addDays } from '../lib/time';

export interface LedgerPost {
  partyId: number;
  entryDate: string;
  entryType: string;
  referenceType?: string | null;
  referenceId?: number | null;
  referenceNo?: string | null;
  description?: string | null;
  debit?: number;
  credit?: number;
  userId: number | null;
  at: string;
}

function post(db: DB, table: 'customer_ledger' | 'supplier_ledger', e: LedgerPost) {
  const debit = Math.round(e.debit ?? 0);
  const credit = Math.round(e.credit ?? 0);
  if (debit === 0 && credit === 0) return;
  const partyCol = table === 'customer_ledger' ? 'customer_id' : 'supplier_id';
  run(
    db,
    `INSERT INTO ${table} (${partyCol}, entry_date, entry_type, reference_type, reference_id, reference_no, description, debit, credit, created_by, created_at)
     VALUES (@partyId, @entryDate, @entryType, @refType, @refId, @refNo, @description, @debit, @credit, @userId, @at)`,
    {
      partyId: e.partyId,
      entryDate: e.entryDate,
      entryType: e.entryType,
      refType: e.referenceType ?? null,
      refId: e.referenceId ?? null,
      refNo: e.referenceNo ?? null,
      description: e.description ?? null,
      debit,
      credit,
      userId: e.userId,
      at: e.at,
    },
  );
}

export const postCustomerLedger = (db: DB, e: LedgerPost) => post(db, 'customer_ledger', e);
export const postSupplierLedger = (db: DB, e: LedgerPost) => post(db, 'supplier_ledger', e);

export function customerBalance(db: DB, customerId: number): number {
  const row = one<{ balance: number }>(
    db,
    `SELECT c.opening_balance + COALESCE((SELECT SUM(debit - credit) FROM customer_ledger WHERE customer_id = c.id), 0) AS balance
     FROM customers c WHERE c.id = ?`,
    [customerId],
  );
  if (!row) throw notFound('Customer');
  return row.balance;
}

export function supplierBalance(db: DB, supplierId: number): number {
  const row = one<{ balance: number }>(
    db,
    `SELECT s.opening_balance + COALESCE((SELECT SUM(credit - debit) FROM supplier_ledger WHERE supplier_id = s.id), 0) AS balance
     FROM suppliers s WHERE s.id = ?`,
    [supplierId],
  );
  if (!row) throw notFound('Supplier');
  return row.balance;
}

interface LedgerRow {
  id: number;
  entryDate: string;
  entryType: string;
  referenceType: string | null;
  referenceId: number | null;
  referenceNo: string | null;
  description: string | null;
  debit: number;
  credit: number;
}

export function statement(
  db: DB,
  kind: 'customer' | 'supplier',
  partyId: number,
  from?: string,
  to?: string,
): LedgerStatement {
  const table = kind === 'customer' ? 'customers' : 'suppliers';
  const ledger = kind === 'customer' ? 'customer_ledger' : 'supplier_ledger';
  const partyCol = kind === 'customer' ? 'customer_id' : 'supplier_id';
  const sign = kind === 'customer' ? 1 : -1;

  const party = one<{ id: number; name: string; phone: string | null; address: string | null; opening_balance: number }>(
    db,
    `SELECT id, name, phone, address, opening_balance FROM ${table} WHERE id = ?`,
    [partyId],
  );
  if (!party) throw notFound(kind === 'customer' ? 'Customer' : 'Supplier');

  const toExclusive = to ? addDays(to, 1) : null;
  let opening = party.opening_balance;
  if (from) {
    const prior = one<{ net: number | null }>(
      db,
      `SELECT SUM(debit - credit) AS net FROM ${ledger} WHERE ${partyCol} = @partyId AND entry_date < @from`,
      { partyId, from },
    );
    opening += sign * (prior?.net ?? 0);
  }

  const rows = all<LedgerRow>(
    db,
    `SELECT id, entry_date AS entryDate, entry_type AS entryType, reference_type AS referenceType,
            reference_id AS referenceId, reference_no AS referenceNo, description, debit, credit
     FROM ${ledger}
     WHERE ${partyCol} = @partyId
       AND (@from IS NULL OR entry_date >= @from)
       AND (@to IS NULL OR entry_date < @to)
     ORDER BY entry_date, id`,
    { partyId, from: from ?? null, to: toExclusive },
  );

  let balance = opening;
  let totalDebit = 0;
  let totalCredit = 0;
  const entries: LedgerEntry[] = rows.map((r) => {
    balance += sign * (r.debit - r.credit);
    totalDebit += r.debit;
    totalCredit += r.credit;
    return { ...r, balance };
  });

  return {
    party: { id: party.id, name: party.name, phone: party.phone, address: party.address },
    from: from ?? null,
    to: to ?? null,
    openingBalance: opening,
    entries,
    totalDebit,
    totalCredit,
    closingBalance: balance,
  };
}
