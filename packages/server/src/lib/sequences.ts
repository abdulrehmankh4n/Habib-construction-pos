import { one, run, type DB } from '../db';

export type SequenceName =
  | 'sale'
  | 'sale_return'
  | 'quotation'
  | 'purchase'
  | 'purchase_return'
  | 'receipt'
  | 'voucher'
  | 'expense'
  | 'adjustment'
  | 'agreement';

export function nextNumber(db: DB, name: SequenceName): string {
  const row = one<{ prefix: string; next_value: number; padding: number }>(
    db,
    'SELECT prefix, next_value, padding FROM sequences WHERE name = ?',
    [name],
  );
  if (!row) throw new Error(`Sequence ${name} is not configured`);
  run(db, 'UPDATE sequences SET next_value = next_value + 1 WHERE name = ?', [name]);
  return `${row.prefix}${String(row.next_value).padStart(row.padding, '0')}`;
}
