import {
  calculateTotals,
  lineGross,
  resolveUnit,
  roundQty,
  type AppSettings,
  type Product,
  type ResolvedUnit,
  type Totals,
} from '@pos/shared';
import type { DB } from '../db';
import type { AuthUser } from '../context';
import { badRequest, unprocessable } from '../lib/errors';
import { getProduct } from './products';

export interface CartItemInput {
  productId: number;
  unitId: number;
  qty: number;
  unitPrice: number;
  discount: number;
}

export interface CartInput {
  items: CartItemInput[];
  billDiscount: number;
  deliveryCharges: number;
  labourCharges: number;
}

export interface PreparedLine {
  product: Product;
  unit: ResolvedUnit;
  qty: number;
  baseQty: number;
  unitPrice: number;
  discount: number;
}

export interface PreparedCart {
  lines: PreparedLine[];
  totals: Totals;
}

function formatRs(paisa: number): string {
  return `Rs ${(paisa / 100).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

export function prepareCart(db: DB, input: CartInput, settings: AppSettings, user: AuthUser): PreparedCart {
  const productCache = new Map<number, Product>();
  const lines: PreparedLine[] = input.items.map((item, index) => {
    let product = productCache.get(item.productId);
    if (!product) {
      product = getProduct(db, item.productId, true);
      productCache.set(item.productId, product);
    }
    if (!product.isActive) throw unprocessable(`${product.name} is inactive and cannot be sold`);
    const unit = resolveUnit(product, item.unitId);
    if (!unit) throw badRequest(`Line ${index + 1}: unit is not configured for ${product.name}`);
    const qty = roundQty(item.qty);
    if (qty <= 0) throw badRequest(`Line ${index + 1}: quantity must be greater than zero`);
    if (!unit.allowDecimal && !Number.isInteger(qty)) {
      throw badRequest(`${product.name}: quantity in ${unit.unitName} must be a whole number`);
    }
    const gross = lineGross(qty, item.unitPrice);
    if (item.discount > gross) throw badRequest(`${product.name}: discount cannot exceed the line amount`);
    return {
      product,
      unit,
      qty,
      baseQty: roundQty(qty * unit.factor),
      unitPrice: Math.round(item.unitPrice),
      discount: Math.round(item.discount),
    };
  });

  const afterLineDiscount = lines.reduce((s, l) => s + lineGross(l.qty, l.unitPrice) - l.discount, 0);
  if (input.billDiscount > afterLineDiscount) throw badRequest('Bill discount cannot exceed the bill amount');

  const totals = calculateTotals({
    lines: lines.map((l) => ({
      qty: l.qty,
      unitPrice: l.unitPrice,
      discount: l.discount,
      taxRate: l.product.taxRate,
    })),
    billDiscount: input.billDiscount,
    deliveryCharges: input.deliveryCharges,
    labourCharges: input.labourCharges,
    taxEnabled: settings.tax.enabled,
    pricesIncludeTax: settings.tax.pricesIncludeTax,
    roundingUnit: settings.sales.roundingUnit,
  });

  if (!user.permissions.includes('sales.price_below_min')) {
    lines.forEach((l, i) => {
      const effectivePerUnit = totals.lines[i].net / l.qty;
      const explicitFloor = l.unit.minPrice;
      const costFloor = Math.round((l.product.costPrice ?? 0) * l.unit.factor);
      const floor = explicitFloor ?? costFloor;
      if (floor > 0 && effectivePerUnit + 0.5 < floor) {
        throw unprocessable(
          explicitFloor !== null
            ? `${l.product.name}: price after discount is below the minimum allowed ${formatRs(explicitFloor)} per ${l.unit.unitName}. Manager approval required.`
            : `${l.product.name}: price after discount is below the allowed limit. Manager approval required.`,
        );
      }
    });
  }

  return { lines, totals };
}
