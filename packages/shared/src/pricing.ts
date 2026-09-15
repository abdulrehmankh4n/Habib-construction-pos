import type { PriceTier } from './constants';
import type { Product } from './types';

export interface ResolvedUnit {
  unitId: number;
  unitName: string;
  unitSymbol: string;
  allowDecimal: boolean;
  factor: number;
  retailPrice: number;
  wholesalePrice: number;
  minPrice: number | null;
}

type PricedProduct = Pick<
  Product,
  'unitId' | 'unitName' | 'unitSymbol' | 'allowDecimal' | 'salePrice' | 'wholesalePrice' | 'minSalePrice' | 'units'
>;

export function resolveUnit(product: PricedProduct, unitId: number): ResolvedUnit | null {
  if (unitId === product.unitId) {
    return {
      unitId,
      unitName: product.unitName,
      unitSymbol: product.unitSymbol,
      allowDecimal: product.allowDecimal,
      factor: 1,
      retailPrice: product.salePrice,
      wholesalePrice: product.wholesalePrice ?? product.salePrice,
      minPrice: product.minSalePrice,
    };
  }
  const alt = product.units.find((u) => u.unitId === unitId);
  if (!alt) return null;
  const retailPrice = alt.salePrice ?? Math.round(product.salePrice * alt.factor);
  const wholesalePrice =
    alt.wholesalePrice ??
    (product.wholesalePrice !== null ? Math.round(product.wholesalePrice * alt.factor) : retailPrice);
  return {
    unitId,
    unitName: alt.unitName ?? '',
    unitSymbol: alt.unitSymbol ?? '',
    allowDecimal: !!alt.allowDecimal,
    factor: alt.factor,
    retailPrice,
    wholesalePrice,
    minPrice: product.minSalePrice !== null ? Math.round(product.minSalePrice * alt.factor) : null,
  };
}

export function tierPrice(unit: ResolvedUnit, tier: PriceTier): number {
  return tier === 'wholesale' ? unit.wholesalePrice : unit.retailPrice;
}
