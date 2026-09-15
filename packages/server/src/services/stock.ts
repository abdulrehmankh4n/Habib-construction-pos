import { roundQty, type StockMovementType } from '@pos/shared';
import { one, run, type DB } from '../db';
import { notFound, unprocessable } from '../lib/errors';
import { nowLocal } from '../lib/time';

export interface StockChange {
  productId: number;
  qtyChange: number;
  type: StockMovementType;
  unitCost?: number;
  costMode?: 'add' | 'remove';
  purchasePrice?: number;
  referenceType?: string | null;
  referenceId?: number | null;
  referenceNo?: string | null;
  note?: string | null;
  userId: number;
  enforceAvailability?: boolean;
  at?: string;
}

interface ProductStockRow {
  id: number;
  name: string;
  stock_qty: number;
  cost_price: number;
  track_stock: number;
  symbol: string;
}

export function getProductStock(db: DB, productId: number): ProductStockRow {
  const p = one<ProductStockRow>(
    db,
    `SELECT p.id, p.name, p.stock_qty, p.cost_price, p.track_stock, u.symbol
     FROM products p JOIN units u ON u.id = p.unit_id WHERE p.id = ?`,
    [productId],
  );
  if (!p) throw notFound('Product');
  return p;
}

export function weightedCost(oldQty: number, oldCost: number, inQty: number, inCost: number): number {
  if (oldQty <= 0) return Math.max(0, Math.round(inCost));
  const total = oldQty + inQty;
  if (total <= 0) return oldCost;
  return Math.max(0, Math.round((oldQty * oldCost + inQty * inCost) / total));
}

export function removedCost(oldQty: number, oldCost: number, outQty: number, outCost: number): number {
  const remaining = oldQty - outQty;
  if (remaining <= 0) return oldCost;
  return Math.max(0, Math.round((oldQty * oldCost - outQty * outCost) / remaining));
}

export function applyStockChange(db: DB, change: StockChange): number {
  const p = getProductStock(db, change.productId);
  const qtyChange = roundQty(change.qtyChange);
  const newQty = roundQty(p.stock_qty + qtyChange);

  if (change.enforceAvailability && qtyChange < 0 && p.track_stock && newQty < 0) {
    throw unprocessable(
      `Insufficient stock for ${p.name}. Available: ${roundQty(p.stock_qty)} ${p.symbol}, required: ${roundQty(-qtyChange)} ${p.symbol}`,
    );
  }

  let newCost = p.cost_price;
  if (change.costMode === 'add' && change.unitCost !== undefined && qtyChange > 0) {
    newCost = weightedCost(p.stock_qty, p.cost_price, qtyChange, change.unitCost);
  } else if (change.costMode === 'remove' && change.unitCost !== undefined && qtyChange < 0) {
    newCost = removedCost(p.stock_qty, p.cost_price, -qtyChange, change.unitCost);
  }

  const now = change.at ?? nowLocal();
  run(
    db,
    `UPDATE products SET stock_qty = @qty, cost_price = @cost,
       purchase_price = COALESCE(@purchasePrice, purchase_price), updated_at = @now
     WHERE id = @id`,
    { qty: newQty, cost: newCost, purchasePrice: change.purchasePrice ?? null, now, id: p.id },
  );

  run(
    db,
    `INSERT INTO stock_movements
       (product_id, movement_type, qty_change, balance_after, unit_cost, reference_type, reference_id, reference_no, note, created_by, created_at)
     VALUES (@productId, @type, @qtyChange, @balance, @unitCost, @refType, @refId, @refNo, @note, @userId, @now)`,
    {
      productId: p.id,
      type: change.type,
      qtyChange,
      balance: newQty,
      unitCost: Math.round(change.unitCost ?? p.cost_price),
      refType: change.referenceType ?? null,
      refId: change.referenceId ?? null,
      refNo: change.referenceNo ?? null,
      note: change.note ?? null,
      userId: change.userId,
      now,
    },
  );
  return newQty;
}
