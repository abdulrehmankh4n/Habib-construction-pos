import type { Database } from 'better-sqlite3';

export const sql = `
ALTER TABLE customers ADD COLUMN father_name TEXT;
ALTER TABLE products ADD COLUMN image_file TEXT;

CREATE TABLE credit_agreements (
  id INTEGER PRIMARY KEY,
  agreement_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  father_name TEXT,
  cnic TEXT,
  phone TEXT,
  address TEXT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  agreement_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  installments INTEGER NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 120),
  terms TEXT,
  witness1_name TEXT,
  witness1_cnic TEXT,
  witness2_name TEXT,
  witness2_cnic TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','cancelled')),
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_credit_agreements_customer ON credit_agreements(customer_id);
CREATE INDEX idx_credit_agreements_due ON credit_agreements(status, due_date);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('sms','whatsapp')),
  recipient TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','opened')),
  error TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  customer_id INTEGER REFERENCES customers(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_created ON notifications(created_at);
CREATE INDEX idx_notifications_ref ON notifications(reference_type, reference_id);

CREATE TABLE zakat_reports (
  id INTEGER PRIMARY KEY,
  report_date TEXT NOT NULL,
  valuation_basis TEXT NOT NULL,
  stock_value INTEGER NOT NULL,
  cash_value INTEGER NOT NULL DEFAULT 0,
  receivables_value INTEGER NOT NULL DEFAULT 0,
  other_assets INTEGER NOT NULL DEFAULT 0,
  liabilities INTEGER NOT NULL DEFAULT 0,
  net_zakatable INTEGER NOT NULL,
  nisab_value INTEGER NOT NULL DEFAULT 0,
  rate REAL NOT NULL,
  zakat_payable INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

INSERT INTO sequences (name, prefix, next_value, padding) VALUES ('agreement', 'AGR-', 1, 5);
`;

export function up(db: Database) {
  db.exec(sql);
}
