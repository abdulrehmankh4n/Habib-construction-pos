import bcrypt from 'bcryptjs';
import { loadConfig } from '../config';
import { migrate, one, openDatabase, run, tx, type DB } from '../db';
import { nowLocal, setTimezone } from '../lib/time';
import { applyStockChange } from '../services/stock';

interface DemoProduct {
  name: string;
  category: string;
  sub: string;
  brand?: string;
  spec?: string;
  size?: string;
  unit: string;
  cost: number;
  sale: number;
  wholesale?: number;
  min?: number;
  stock: number;
  minStock: number;
  hs?: string;
  urdu?: string;
  units?: { unit: string; factor: number }[];
  supplier?: string;
}

const rs = (v: number) => Math.round(v * 100);

const SUPPLIERS = [
  { name: 'Al-Madina Cement Traders', company: 'Cement Distributor', phone: '0300-4455667', city: 'Lahore' },
  { name: 'Khan Steel House', company: 'Steel Distributor', phone: '0321-7788990', city: 'Lahore' },
  { name: 'Chaudhry Sand & Crush', company: 'Sand / Crush Supplier', phone: '0333-1122334', city: 'Lahore' },
  { name: 'Pak Pipes & Sanitary', company: 'Plumbing Distributor', phone: '0345-5566778', city: 'Lahore' },
  { name: 'Butt Brick Kiln', company: 'Bhatta', phone: '0301-9988776', city: 'Sheikhupura' },
];

const CUSTOMERS = [
  {
    name: 'Haji Muhammad Aslam (Contractor)',
    phone: '0300-1234567',
    cnic: '35202-1234567-1',
    type: 'contractor',
    tier: 'wholesale',
    limit: rs(500000),
    opening: rs(25000),
    city: 'Lahore',
  },
  {
    name: 'Bilal Builders & Developers',
    phone: '0321-2345678',
    cnic: null,
    type: 'builder',
    tier: 'wholesale',
    limit: rs(1500000),
    opening: 0,
    city: 'Lahore',
  },
  {
    name: 'Ahmed Raza',
    phone: '0333-3456789',
    cnic: null,
    type: 'retail',
    tier: 'retail',
    limit: rs(50000),
    opening: 0,
    city: 'Lahore',
  },
];

const SAND_UNITS = [
  { unit: 'trolley', factor: 150 },
  { unit: 'truck', factor: 600 },
];

const PRODUCTS: DemoProduct[] = [
  { name: 'Lucky OPC Cement', category: 'Cement', sub: 'OPC Cement', brand: 'Lucky', size: '50 KG', unit: 'bag', cost: 1380, sale: 1450, wholesale: 1430, min: 1410, stock: 400, minStock: 100, hs: '2523.2900', urdu: 'لکی سیمنٹ', supplier: 'Al-Madina Cement Traders' },
  { name: 'Bestway OPC Cement', category: 'Cement', sub: 'OPC Cement', brand: 'Bestway', size: '50 KG', unit: 'bag', cost: 1370, sale: 1440, wholesale: 1420, min: 1400, stock: 300, minStock: 100, hs: '2523.2900', urdu: 'بیسٹ وے سیمنٹ', supplier: 'Al-Madina Cement Traders' },
  { name: 'DG Khan OPC Cement', category: 'Cement', sub: 'OPC Cement', brand: 'DG Khan', size: '50 KG', unit: 'bag', cost: 1360, sale: 1430, wholesale: 1410, stock: 250, minStock: 80, hs: '2523.2900', urdu: 'ڈی جی خان سیمنٹ', supplier: 'Al-Madina Cement Traders' },
  { name: 'Maple Leaf OPC Cement', category: 'Cement', sub: 'OPC Cement', brand: 'Maple Leaf', size: '50 KG', unit: 'bag', cost: 1375, sale: 1445, wholesale: 1425, stock: 200, minStock: 80, hs: '2523.2900', supplier: 'Al-Madina Cement Traders' },
  { name: 'Cherat OPC Cement', category: 'Cement', sub: 'OPC Cement', brand: 'Cherat', size: '50 KG', unit: 'bag', cost: 1350, sale: 1420, stock: 60, minStock: 80, hs: '2523.2900', supplier: 'Al-Madina Cement Traders' },
  { name: 'Lucky SRC Cement', category: 'Cement', sub: 'SRC Cement', brand: 'Lucky', spec: 'Sulphate Resistant', size: '50 KG', unit: 'bag', cost: 1480, sale: 1560, stock: 120, minStock: 40, hs: '2523.2900', supplier: 'Al-Madina Cement Traders' },
  { name: 'Maple Leaf White Cement', category: 'Cement', sub: 'White Cement', brand: 'Maple Leaf', size: '40 KG', unit: 'bag', cost: 2600, sale: 2850, stock: 40, minStock: 10, hs: '2523.2100' },
  { name: 'Mughal Steel 10mm', category: 'Steel / Saria', sub: 'Deformed Steel Bar Grade 60', brand: 'Mughal', spec: 'Grade 60', size: '10mm', unit: 'kg', cost: 238, sale: 252, wholesale: 248, min: 244, stock: 4000, minStock: 1000, hs: '7214.2000', urdu: 'مغل سریا', units: [{ unit: 'ton', factor: 1000 }], supplier: 'Khan Steel House' },
  { name: 'Mughal Steel 12mm', category: 'Steel / Saria', sub: 'Deformed Steel Bar Grade 60', brand: 'Mughal', spec: 'Grade 60', size: '12mm', unit: 'kg', cost: 236, sale: 250, wholesale: 246, min: 242, stock: 6000, minStock: 1500, hs: '7214.2000', urdu: 'مغل سریا', units: [{ unit: 'ton', factor: 1000 }], supplier: 'Khan Steel House' },
  { name: 'Mughal Steel 16mm', category: 'Steel / Saria', sub: 'Deformed Steel Bar Grade 60', brand: 'Mughal', spec: 'Grade 60', size: '16mm', unit: 'kg', cost: 235, sale: 249, wholesale: 245, stock: 3000, minStock: 1000, hs: '7214.2000', units: [{ unit: 'ton', factor: 1000 }], supplier: 'Khan Steel House' },
  { name: 'Amreli Steel 12mm', category: 'Steel / Saria', sub: 'Deformed Steel Bar Grade 60', brand: 'Amreli', spec: 'Grade 60', size: '12mm', unit: 'kg', cost: 240, sale: 255, wholesale: 251, stock: 2500, minStock: 1000, hs: '7214.2000', units: [{ unit: 'ton', factor: 1000 }], supplier: 'Khan Steel House' },
  { name: 'FF Steel 10mm', category: 'Steel / Saria', sub: 'Deformed Steel Bar Grade 40', brand: 'FF Steel', spec: 'Grade 40', size: '10mm', unit: 'kg', cost: 225, sale: 238, stock: 1500, minStock: 500, hs: '7214.2000', units: [{ unit: 'ton', factor: 1000 }], supplier: 'Khan Steel House' },
  { name: 'Binding Wire', category: 'Steel / Saria', sub: 'Binding Wire', size: '18 Gauge', unit: 'kg', cost: 290, sale: 330, stock: 300, minStock: 50, hs: '7217.1000' },
  { name: 'Steel Nails 3 inch', category: 'Steel / Saria', sub: 'Steel Nails', size: '3"', unit: 'kg', cost: 300, sale: 350, stock: 150, minStock: 30 },
  { name: 'Awwal Bricks', category: 'Bricks & Blocks', sub: 'Awwal Bricks', size: '9x4.5x3 in', unit: 'pc', cost: 15, sale: 17, wholesale: 16.5, stock: 25000, minStock: 5000, urdu: 'اول اینٹ', units: [{ unit: '1000', factor: 1000 }], supplier: 'Butt Brick Kiln' },
  { name: 'A-Class Bricks', category: 'Bricks & Blocks', sub: 'A-Class Bricks', size: '9x4.5x3 in', unit: 'pc', cost: 13, sale: 15, stock: 15000, minStock: 5000, units: [{ unit: '1000', factor: 1000 }], supplier: 'Butt Brick Kiln' },
  { name: 'Concrete Hollow Block 6"', category: 'Bricks & Blocks', sub: 'Hollow Blocks', size: '16x8x6 in', unit: 'pc', cost: 80, sale: 95, stock: 800, minStock: 200 },
  { name: 'Ravi Sand', category: 'Sand', sub: 'Ravi Sand', unit: 'cft', cost: 45, sale: 60, wholesale: 55, stock: 3000, minStock: 600, urdu: 'راوی ریت', units: SAND_UNITS, supplier: 'Chaudhry Sand & Crush' },
  { name: 'Chenab Sand', category: 'Sand', sub: 'Chenab Sand', unit: 'cft', cost: 75, sale: 95, wholesale: 90, stock: 2400, minStock: 600, urdu: 'چناب ریت', units: SAND_UNITS, supplier: 'Chaudhry Sand & Crush' },
  { name: 'Lawrencepur Sand', category: 'Sand', sub: 'Lawrencepur Sand', unit: 'cft', cost: 105, sale: 130, stock: 900, minStock: 300, units: SAND_UNITS, supplier: 'Chaudhry Sand & Crush' },
  { name: 'Margalla Crush 3/4"', category: 'Crush / Aggregate', sub: '3/4" Crush', unit: 'cft', cost: 160, sale: 190, wholesale: 182, stock: 1800, minStock: 600, urdu: 'مارگلہ کرش', units: SAND_UNITS, supplier: 'Chaudhry Sand & Crush' },
  { name: 'Sargodha Crush 1/2"', category: 'Crush / Aggregate', sub: 'Sargodha Crush', size: '1/2"', unit: 'cft', cost: 140, sale: 170, stock: 1500, minStock: 600, units: SAND_UNITS, supplier: 'Chaudhry Sand & Crush' },
  { name: 'Bajri', category: 'Crush / Aggregate', sub: 'Bajri', unit: 'cft', cost: 90, sale: 115, stock: 1200, minStock: 300, urdu: 'بجری', units: SAND_UNITS, supplier: 'Chaudhry Sand & Crush' },
  { name: 'Dadex PVC Pipe 4"', category: 'Plumbing', sub: 'PVC Pipes', brand: 'Dadex', spec: 'Class B', size: '4 inch', unit: 'ft', cost: 150, sale: 180, stock: 800, minStock: 200, hs: '3917.2300', units: [{ unit: 'len', factor: 20 }], supplier: 'Pak Pipes & Sanitary' },
  { name: 'Master PPRC Pipe 1"', category: 'Plumbing', sub: 'PPRC Pipes', brand: 'Master', spec: 'PN-20', size: '1 inch', unit: 'len', cost: 950, sale: 1150, stock: 120, minStock: 30, hs: '3917.2200', supplier: 'Pak Pipes & Sanitary' },
  { name: 'PPRC Elbow 1"', category: 'Plumbing', sub: 'Elbows', brand: 'Popular', size: '1 inch', unit: 'pc', cost: 45, sale: 60, stock: 400, minStock: 100, units: [{ unit: 'dozen', factor: 12 }] },
  { name: 'Brass Ball Valve 1/2"', category: 'Plumbing', sub: 'Ball Valves', size: '1/2 inch', unit: 'pc', cost: 520, sale: 650, stock: 60, minStock: 20 },
  { name: 'House Wire 7/29', category: 'Electrical', sub: 'House Wiring', spec: '7/29 Copper', size: '90 m', unit: 'coil', cost: 8200, sale: 9500, stock: 25, minStock: 5 },
  { name: 'MCB 32A Single Pole', category: 'Electrical', sub: 'MCB', size: '32A', unit: 'pc', cost: 600, sale: 750, stock: 40, minStock: 10 },
  { name: 'LED Bulb 12W', category: 'Electrical', sub: 'LED Bulbs', size: '12W', unit: 'pc', cost: 190, sale: 250, stock: 150, minStock: 30 },
  { name: 'Berger Weather Shield', category: 'Paint & Finishing', sub: 'Weather Shield', brand: 'Berger', unit: 'gal', cost: 3700, sale: 4200, stock: 30, minStock: 10, units: [{ unit: 'drum', factor: 4 }] },
  { name: 'Nippon Interior Emulsion', category: 'Paint & Finishing', sub: 'Interior Emulsion', brand: 'Nippon', unit: 'gal', cost: 2700, sale: 3100, stock: 35, minStock: 10, units: [{ unit: 'drum', factor: 4 }] },
  { name: 'Diamond Wall Putty', category: 'Paint & Finishing', sub: 'Wall Putty', brand: 'Diamond', size: '20 KG', unit: 'bag', cost: 950, sale: 1100, stock: 50, minStock: 15 },
  { name: 'Porcelain Floor Tile 24x24', category: 'Tiles & Flooring', sub: 'Porcelain Tiles', size: '24x24 in', unit: 'sqft', cost: 230, sale: 280, stock: 1600, minStock: 320, units: [{ unit: 'box', factor: 16 }] },
  { name: 'Tile Adhesive', category: 'Tiles & Flooring', sub: 'Tile Adhesive', size: '20 KG', unit: 'bag', cost: 1050, sale: 1250, stock: 40, minStock: 10 },
  { name: 'Wall Plug 8mm', category: 'Hardware', sub: 'Wall Plugs', size: '8mm (100 pcs)', unit: 'pkt', cost: 110, sale: 150, stock: 60, minStock: 15 },
  { name: 'Cutting Disc 4"', category: 'Hardware', sub: 'Cutting Discs', size: '4 inch', unit: 'pc', cost: 90, sale: 120, stock: 100, minStock: 25 },
  { name: 'Measuring Tape 5m', category: 'Tools', sub: 'Measuring Tape', size: '5 m', unit: 'pc', cost: 260, sale: 350, stock: 20, minStock: 5 },
  { name: 'Masonry Trowel', category: 'Tools', sub: 'Trowel', unit: 'pc', cost: 220, sale: 300, stock: 25, minStock: 5 },
  { name: 'Safety Helmet', category: 'Safety', sub: 'Safety Helmet', unit: 'pc', cost: 330, sale: 450, stock: 30, minStock: 10 },
  { name: 'Work Gloves', category: 'Safety', sub: 'Gloves', unit: 'pair', cost: 120, sale: 180, stock: 50, minStock: 10 },
];

function idOf(db: DB, sql: string, value: string): number {
  const row = one<{ id: number }>(db, sql, [value]);
  if (!row) throw new Error(`Lookup failed for "${value}"`);
  return row.id;
}

function seed(db: DB) {
  const existing = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM products')!.n;
  if (existing > 0) {
    console.log(`Database already has ${existing} products. Demo data was not added.`);
    return;
  }
  const admin = one<{ id: number }>(db, "SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  const now = nowLocal();
  let adminId = admin?.id;
  if (!adminId) {
    adminId = Number(
      run(
        db,
        `INSERT INTO users (username, full_name, password_hash, role, must_change_password, created_at, updated_at)
         VALUES ('admin', 'Administrator', ?, 'admin', 1, ?, ?)`,
        [bcrypt.hashSync('admin123', 10), now, now],
      ).lastInsertRowid,
    );
  }
  if (!one(db, "SELECT id FROM users WHERE username = 'cashier'")) {
    run(
      db,
      `INSERT INTO users (username, full_name, password_hash, role, must_change_password, created_at, updated_at)
       VALUES ('cashier', 'Counter Salesman', ?, 'cashier', 1, ?, ?)`,
      [bcrypt.hashSync('cashier123', 10), now, now],
    );
  }

  for (const s of SUPPLIERS) {
    run(
      db,
      `INSERT INTO suppliers (name, company, phone, city, opening_balance, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [s.name, s.company, s.phone, s.city, now, now],
    );
  }
  for (const c of CUSTOMERS) {
    run(
      db,
      `INSERT INTO customers (name, phone, cnic, city, customer_type, price_tier, credit_limit, opening_balance,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.name, c.phone, c.cnic, c.city, c.type, c.tier, c.limit, c.opening, now, now],
    );
  }

  const taxId = one<{ id: number }>(db, 'SELECT id FROM tax_rates WHERE is_default = 1')!.id;
  const counters = new Map<number, number>();
  for (const p of PRODUCTS) {
    const categoryId = idOf(db, 'SELECT id FROM categories WHERE name = ?', p.category);
    const subId = one<{ id: number }>(db, 'SELECT id FROM subcategories WHERE category_id = ? AND name = ?', [
      categoryId,
      p.sub,
    ])?.id;
    const brandId = p.brand ? idOf(db, 'SELECT id FROM brands WHERE name = ?', p.brand) : null;
    const unitId = idOf(db, 'SELECT id FROM units WHERE symbol = ?', p.unit);
    const supplierId = p.supplier ? idOf(db, 'SELECT id FROM suppliers WHERE name = ?', p.supplier) : null;
    const catName = p.category.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
    const n = (counters.get(categoryId) ?? 0) + 1;
    counters.set(categoryId, n);
    const sku = `${catName}-${String(n).padStart(4, '0')}`;
    const res = run(
      db,
      `INSERT INTO products (sku, name, urdu_name, category_id, subcategory_id, brand_id, specification, size, unit_id,
         purchase_price, cost_price, sale_price, wholesale_price, min_sale_price, stock_qty, min_stock, supplier_id,
         tax_rate_id, hs_code, track_stock, is_active, created_at, updated_at)
       VALUES (@sku, @name, @urdu, @categoryId, @subId, @brandId, @spec, @size, @unitId, @cost, @cost, @sale,
         @wholesale, @min, 0, @minStock, @supplierId, @taxId, @hs, 1, 1, @now, @now)`,
      {
        sku,
        name: p.name,
        urdu: p.urdu ?? null,
        categoryId,
        subId: subId ?? null,
        brandId,
        spec: p.spec ?? null,
        size: p.size ?? null,
        unitId,
        cost: rs(p.cost),
        sale: rs(p.sale),
        wholesale: p.wholesale ? rs(p.wholesale) : null,
        min: p.min ? rs(p.min) : null,
        minStock: p.minStock,
        supplierId,
        taxId,
        hs: p.hs ?? null,
        now,
      },
    );
    const productId = Number(res.lastInsertRowid);
    for (const u of p.units ?? []) {
      run(db, 'INSERT INTO product_units (product_id, unit_id, factor) VALUES (?, ?, ?)', [
        productId,
        idOf(db, 'SELECT id FROM units WHERE symbol = ?', u.unit),
        u.factor,
      ]);
    }
    applyStockChange(db, {
      productId,
      qtyChange: p.stock,
      type: 'opening',
      unitCost: rs(p.cost),
      note: 'Opening stock (demo data)',
      userId: adminId,
      at: now,
    });
  }
  console.log(
    `Demo data added: ${PRODUCTS.length} products, ${CUSTOMERS.length} customers, ${SUPPLIERS.length} suppliers.`,
  );
  console.log('Demo cashier login: cashier / cashier123 (must change password at first login)');
}

const config = loadConfig();
setTimezone(config.timezone);
const db = openDatabase(config.dbPath);
migrate(db);
tx(db, () => seed(db));
db.close();
