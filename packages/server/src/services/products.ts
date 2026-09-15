import type { Product, ProductUnit } from '@pos/shared';
import { all, one, type DB } from '../db';
import { notFound } from '../lib/errors';

export const PRODUCT_SELECT = `
SELECT p.id, p.sku, p.barcode, p.name, p.urdu_name AS urduName,
  p.category_id AS categoryId, c.name AS categoryName,
  p.subcategory_id AS subcategoryId, sc.name AS subcategoryName,
  p.brand_id AS brandId, b.name AS brandName,
  p.specification, p.size,
  p.unit_id AS unitId, u.name AS unitName, u.symbol AS unitSymbol, u.allow_decimal AS allowDecimal,
  p.purchase_price AS purchasePrice, p.cost_price AS costPrice, p.sale_price AS salePrice,
  p.wholesale_price AS wholesalePrice, p.min_sale_price AS minSalePrice,
  p.stock_qty AS stockQty, p.min_stock AS minStock,
  p.supplier_id AS supplierId, sup.name AS supplierName,
  p.tax_rate_id AS taxRateId, t.rate AS taxRate, t.name AS taxRateName,
  p.hs_code AS hsCode, p.location, p.track_stock AS trackStock, p.notes, p.is_active AS isActive,
  p.image_file AS imageFile, p.created_at AS createdAt, p.updated_at AS updatedAt
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
LEFT JOIN brands b ON b.id = p.brand_id
JOIN units u ON u.id = p.unit_id
LEFT JOIN suppliers sup ON sup.id = p.supplier_id
JOIN tax_rates t ON t.id = p.tax_rate_id`;

export type ProductRow = Omit<Product, 'units' | 'imageUrl'> & { imageFile: string | null };

export function productImageUrl(id: number, file: string | null): string | null {
  return file ? `/api/products/${id}/image?v=${encodeURIComponent(file)}` : null;
}

export function loadUnits(db: DB, productIds: number[]): Map<number, ProductUnit[]> {
  const map = new Map<number, ProductUnit[]>();
  if (productIds.length === 0) return map;
  const rows = all<ProductUnit & { productId: number }>(
    db,
    `SELECT pu.id, pu.product_id AS productId, pu.unit_id AS unitId, u.name AS unitName, u.symbol AS unitSymbol,
       u.allow_decimal AS allowDecimal, pu.factor, pu.sale_price AS salePrice, pu.wholesale_price AS wholesalePrice,
       pu.barcode
     FROM product_units pu JOIN units u ON u.id = pu.unit_id
     WHERE pu.product_id IN (SELECT value FROM json_each(?))
     ORDER BY pu.factor`,
    [JSON.stringify(productIds)],
  );
  for (const r of rows) {
    const { productId, ...unit } = r;
    const list = map.get(productId) ?? [];
    list.push({ ...unit, allowDecimal: !!unit.allowDecimal });
    map.set(productId, list);
  }
  return map;
}

export function hydrateProducts(db: DB, rows: ProductRow[], showCost: boolean): Product[] {
  const units = loadUnits(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => {
    const { imageFile, ...rest } = r;
    const p: Product = {
      ...rest,
      allowDecimal: !!r.allowDecimal,
      trackStock: !!r.trackStock,
      isActive: !!r.isActive,
      imageUrl: productImageUrl(r.id, imageFile),
      units: units.get(r.id) ?? [],
    };
    if (!showCost) {
      delete p.purchasePrice;
      delete p.costPrice;
    }
    return p;
  });
}

export function getProduct(db: DB, id: number, showCost: boolean): Product {
  const row = one<ProductRow>(db, `${PRODUCT_SELECT} WHERE p.id = ?`, [id]);
  if (!row) throw notFound('Product');
  return hydrateProducts(db, [row], showCost)[0];
}

export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (m) => `\\${m}`);
}
