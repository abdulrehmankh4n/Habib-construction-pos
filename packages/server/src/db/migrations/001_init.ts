import type { Database } from 'better-sqlite3';

const PAYMENT_METHOD_CHECK = `('cash','card','bank_transfer','jazzcash','easypaisa','cheque')`;
const REFUND_METHOD_CHECK = `('cash','card','bank_transfer','jazzcash','easypaisa','cheque','account')`;

export const sql = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sequences (
  name TEXT PRIMARY KEY,
  prefix TEXT NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value >= 1),
  padding INTEGER NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 12)
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','cashier')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0,1)),
  token_version INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE subcategories (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (category_id, name)
);
CREATE INDEX idx_subcategories_category ON subcategories(category_id);

CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE units (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  symbol TEXT NOT NULL UNIQUE COLLATE NOCASE,
  allow_decimal INTEGER NOT NULL DEFAULT 0 CHECK (allow_decimal IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tax_rates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  rate REAL NOT NULL CHECK (rate >= 0 AND rate <= 100),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  ntn TEXT,
  strn TEXT,
  opening_balance INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_suppliers_name ON suppliers(name);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  cnic TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  ntn TEXT,
  strn TEXT,
  customer_type TEXT NOT NULL DEFAULT 'retail'
    CHECK (customer_type IN ('retail','contractor','builder','wholesale','government','other')),
  price_tier TEXT NOT NULL DEFAULT 'retail' CHECK (price_tier IN ('retail','wholesale')),
  credit_limit INTEGER CHECK (credit_limit IS NULL OR credit_limit >= 0),
  opening_balance INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_phone ON customers(phone);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  urdu_name TEXT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  subcategory_id INTEGER REFERENCES subcategories(id),
  brand_id INTEGER REFERENCES brands(id),
  specification TEXT,
  size TEXT,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  purchase_price INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  cost_price INTEGER NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  sale_price INTEGER NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  wholesale_price INTEGER CHECK (wholesale_price IS NULL OR wholesale_price >= 0),
  min_sale_price INTEGER CHECK (min_sale_price IS NULL OR min_sale_price >= 0),
  stock_qty REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  supplier_id INTEGER REFERENCES suppliers(id),
  tax_rate_id INTEGER NOT NULL REFERENCES tax_rates(id),
  hs_code TEXT,
  location TEXT,
  track_stock INTEGER NOT NULL DEFAULT 1 CHECK (track_stock IN (0,1)),
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_subcategory ON products(subcategory_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_name ON products(name);

CREATE TABLE product_units (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  factor REAL NOT NULL CHECK (factor > 0),
  sale_price INTEGER CHECK (sale_price IS NULL OR sale_price >= 0),
  wholesale_price INTEGER CHECK (wholesale_price IS NULL OR wholesale_price >= 0),
  barcode TEXT UNIQUE,
  UNIQUE (product_id, unit_id)
);

CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN
    ('opening','purchase','purchase_return','purchase_void','sale','sale_return','sale_void','adjustment')),
  qty_change REAL NOT NULL,
  balance_after REAL NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id INTEGER,
  reference_no TEXT,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, id);
CREATE INDEX idx_stock_movements_ref ON stock_movements(reference_type, reference_id);
CREATE INDEX idx_stock_movements_created ON stock_movements(created_at);

CREATE TABLE quotations (
  id INTEGER PRIMARY KEY,
  quotation_no TEXT NOT NULL UNIQUE,
  quotation_date TEXT NOT NULL,
  valid_until TEXT,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','converted','cancelled')),
  price_tier TEXT NOT NULL DEFAULT 'retail',
  subtotal INTEGER NOT NULL,
  item_discount INTEGER NOT NULL DEFAULT 0,
  bill_discount INTEGER NOT NULL DEFAULT 0,
  taxable_value INTEGER NOT NULL,
  tax_total INTEGER NOT NULL DEFAULT 0,
  delivery_charges INTEGER NOT NULL DEFAULT 0,
  labour_charges INTEGER NOT NULL DEFAULT 0,
  round_off INTEGER NOT NULL DEFAULT 0,
  grand_total INTEGER NOT NULL,
  prices_include_tax INTEGER NOT NULL,
  notes TEXT,
  sale_id INTEGER REFERENCES sales(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_quotations_date ON quotations(quotation_date);

CREATE TABLE quotation_items (
  id INTEGER PRIMARY KEY,
  quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  unit_name TEXT NOT NULL,
  unit_factor REAL NOT NULL,
  qty REAL NOT NULL CHECK (qty > 0),
  unit_price INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  bill_discount_share INTEGER NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  taxable_value INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL
);
CREATE INDEX idx_quotation_items_quotation ON quotation_items(quotation_id);

CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  invoice_no TEXT NOT NULL UNIQUE,
  sale_date TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','void')),
  price_tier TEXT NOT NULL DEFAULT 'retail',
  subtotal INTEGER NOT NULL,
  item_discount INTEGER NOT NULL DEFAULT 0,
  bill_discount INTEGER NOT NULL DEFAULT 0,
  taxable_value INTEGER NOT NULL,
  tax_total INTEGER NOT NULL DEFAULT 0,
  delivery_charges INTEGER NOT NULL DEFAULT 0,
  labour_charges INTEGER NOT NULL DEFAULT 0,
  round_off INTEGER NOT NULL DEFAULT 0,
  grand_total INTEGER NOT NULL CHECK (grand_total >= 0),
  paid_amount INTEGER NOT NULL DEFAULT 0,
  balance_due INTEGER NOT NULL DEFAULT 0,
  cash_tendered INTEGER NOT NULL DEFAULT 0,
  change_due INTEGER NOT NULL DEFAULT 0,
  cost_total INTEGER NOT NULL DEFAULT 0,
  prices_include_tax INTEGER NOT NULL,
  delivery_required INTEGER NOT NULL DEFAULT 0 CHECK (delivery_required IN (0,1)),
  delivery_status TEXT CHECK (delivery_status IS NULL OR delivery_status IN ('pending','dispatched','delivered','cancelled')),
  delivery_address TEXT,
  vehicle_no TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  delivered_at TEXT,
  notes TEXT,
  quotation_id INTEGER REFERENCES quotations(id),
  fbr_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (fbr_status IN ('not_applicable','pending','synced','failed')),
  fbr_invoice_no TEXT,
  fbr_error TEXT,
  fbr_attempts INTEGER NOT NULL DEFAULT 0,
  fbr_synced_at TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  voided_by INTEGER REFERENCES users(id),
  voided_at TEXT,
  void_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_status ON sales(status, sale_date);
CREATE INDEX idx_sales_delivery ON sales(delivery_status);
CREATE INDEX idx_sales_fbr ON sales(fbr_status);

CREATE TABLE sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  urdu_name TEXT,
  sku TEXT,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  unit_name TEXT NOT NULL,
  unit_factor REAL NOT NULL CHECK (unit_factor > 0),
  qty REAL NOT NULL CHECK (qty > 0),
  base_qty REAL NOT NULL,
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  discount INTEGER NOT NULL DEFAULT 0,
  bill_discount_share INTEGER NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  taxable_value INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL,
  cost_price INTEGER NOT NULL DEFAULT 0,
  hs_code TEXT
);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

CREATE TABLE sale_returns (
  id INTEGER PRIMARY KEY,
  return_no TEXT NOT NULL UNIQUE,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  customer_id INTEGER REFERENCES customers(id),
  return_date TEXT NOT NULL,
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  tax_total INTEGER NOT NULL DEFAULT 0,
  cost_total INTEGER NOT NULL DEFAULT 0,
  refund_method TEXT NOT NULL CHECK (refund_method IN ${REFUND_METHOD_CHECK}),
  refund_amount INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sale_returns_sale ON sale_returns(sale_id);
CREATE INDEX idx_sale_returns_date ON sale_returns(return_date);

CREATE TABLE sale_return_items (
  id INTEGER PRIMARY KEY,
  sale_return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL CHECK (qty > 0),
  base_qty REAL NOT NULL,
  amount INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  cost_price INTEGER NOT NULL DEFAULT 0,
  restock INTEGER NOT NULL DEFAULT 1 CHECK (restock IN (0,1))
);
CREATE INDEX idx_sale_return_items_return ON sale_return_items(sale_return_id);
CREATE INDEX idx_sale_return_items_item ON sale_return_items(sale_item_id);

CREATE TABLE held_bills (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  payload TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE purchases (
  id INTEGER PRIMARY KEY,
  purchase_no TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  supplier_invoice_no TEXT,
  purchase_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','void')),
  subtotal INTEGER NOT NULL,
  item_discount INTEGER NOT NULL DEFAULT 0,
  bill_discount INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  freight_charges INTEGER NOT NULL DEFAULT 0,
  other_charges INTEGER NOT NULL DEFAULT 0,
  grand_total INTEGER NOT NULL CHECK (grand_total >= 0),
  paid_amount INTEGER NOT NULL DEFAULT 0,
  vehicle_no TEXT,
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  voided_by INTEGER REFERENCES users(id),
  voided_at TEXT,
  void_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_purchases_date ON purchases(purchase_date);
CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);

CREATE TABLE purchase_items (
  id INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  unit_name TEXT NOT NULL,
  unit_factor REAL NOT NULL CHECK (unit_factor > 0),
  qty REAL NOT NULL CHECK (qty > 0),
  base_qty REAL NOT NULL,
  unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0),
  discount INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL,
  landed_unit_cost INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_product ON purchase_items(product_id);

CREATE TABLE purchase_returns (
  id INTEGER PRIMARY KEY,
  return_no TEXT NOT NULL UNIQUE,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  return_date TEXT NOT NULL,
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  refund_method TEXT NOT NULL CHECK (refund_method IN ${REFUND_METHOD_CHECK}),
  refund_amount INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_purchase_returns_purchase ON purchase_returns(purchase_id);

CREATE TABLE purchase_return_items (
  id INTEGER PRIMARY KEY,
  purchase_return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  purchase_item_id INTEGER NOT NULL REFERENCES purchase_items(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL CHECK (qty > 0),
  base_qty REAL NOT NULL,
  amount INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_purchase_return_items_item ON purchase_return_items(purchase_item_id);

CREATE TABLE stock_adjustments (
  id INTEGER PRIMARY KEY,
  adjustment_no TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('in','out')),
  qty REAL NOT NULL CHECK (qty > 0),
  reason TEXT NOT NULL,
  note TEXT,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_stock_adjustments_created ON stock_adjustments(created_at);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  payment_no TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  party_type TEXT NOT NULL CHECK (party_type IN ('customer','supplier','walk_in')),
  customer_id INTEGER REFERENCES customers(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  sale_id INTEGER REFERENCES sales(id),
  sale_return_id INTEGER REFERENCES sale_returns(id),
  purchase_id INTEGER REFERENCES purchases(id),
  purchase_return_id INTEGER REFERENCES purchase_returns(id),
  method TEXT NOT NULL CHECK (method IN ${PAYMENT_METHOD_CHECK}),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reference TEXT,
  payment_date TEXT NOT NULL,
  notes TEXT,
  is_void INTEGER NOT NULL DEFAULT 0 CHECK (is_void IN (0,1)),
  voided_by INTEGER REFERENCES users(id),
  voided_at TEXT,
  void_reason TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_payments_date ON payments(payment_date);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_supplier ON payments(supplier_id);
CREATE INDEX idx_payments_sale ON payments(sale_id);
CREATE INDEX idx_payments_purchase ON payments(purchase_id);

CREATE TABLE customer_ledger (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN
    ('sale','payment','sale_return','refund','sale_void','payment_void','adjustment')),
  reference_type TEXT,
  reference_id INTEGER,
  reference_no TEXT,
  description TEXT,
  debit INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_customer_ledger_customer ON customer_ledger(customer_id, entry_date, id);

CREATE TABLE supplier_ledger (
  id INTEGER PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN
    ('purchase','payment','purchase_return','refund','purchase_void','payment_void','adjustment')),
  reference_type TEXT,
  reference_id INTEGER,
  reference_no TEXT,
  description TEXT,
  debit INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_supplier_ledger_supplier ON supplier_ledger(supplier_id, entry_date, id);

CREATE TABLE expense_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  expense_no TEXT NOT NULL UNIQUE,
  expense_date TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ${PAYMENT_METHOD_CHECK}),
  paid_to TEXT,
  reference TEXT,
  notes TEXT,
  is_void INTEGER NOT NULL DEFAULT 0 CHECK (is_void IN (0,1)),
  voided_by INTEGER REFERENCES users(id),
  voided_at TEXT,
  void_reason TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_expenses_date ON expenses(expense_date);

CREATE TABLE day_closings (
  id INTEGER PRIMARY KEY,
  closing_date TEXT NOT NULL UNIQUE,
  opening_cash INTEGER NOT NULL,
  cash_in INTEGER NOT NULL,
  cash_out INTEGER NOT NULL,
  expected_cash INTEGER NOT NULL,
  counted_cash INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  notes TEXT,
  closed_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  username TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
`;

export function up(db: Database) {
  db.exec(sql);
}
