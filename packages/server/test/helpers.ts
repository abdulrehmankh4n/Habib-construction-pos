import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pino from 'pino';
import request from 'supertest';
import type { AppConfig } from '../src/config';
import type { AppContext } from '../src/context';
import { migrate, one, openDatabase } from '../src/db';
import { createApp, ensureAdminUser } from '../src/app';
import { setTimezone } from '../src/lib/time';
import { LiveEvents } from '../src/services/events';

const H = { 'X-Requested-With': 'XMLHttpRequest' };

export type Client = ReturnType<typeof makeClient>;

function makeClient(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  return {
    agent,
    get: (url: string) => agent.get(url).set(H),
    post: (url: string, body: unknown = {}) => agent.post(url).set(H).send(body as object),
    put: (url: string, body: unknown = {}) => agent.put(url).set(H).send(body as object),
    patch: (url: string, body: unknown = {}) => agent.patch(url).set(H).send(body as object),
    del: (url: string) => agent.delete(url).set(H),
  };
}

export async function setup() {
  setTimezone('Asia/Karachi');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-test-'));
  const config: AppConfig = {
    env: 'test',
    port: 0,
    host: '127.0.0.1',
    dataDir: dir,
    dbPath: ':memory:',
    backupDir: path.join(dir, 'backups'),
    timezone: 'Asia/Karachi',
    jwtSecret: 'test-secret-test-secret-test-secret-123456',
    sessionHours: 12,
    cookieSecure: false,
    initialAdminPassword: 'admin123',
    logLevel: 'silent',
    webDist: null,
    https: null,
  };
  const db = openDatabase(':memory:');
  migrate(db);
  const ctx: AppContext = {
    db,
    config,
    logger: pino({ level: process.env.TEST_LOG_LEVEL ?? 'silent' }),
    events: new LiveEvents(),
  };
  ensureAdminUser(ctx);
  const app = createApp(ctx);

  const admin = makeClient(app);
  await admin.post('/api/auth/login', { username: 'admin', password: 'admin123' }).expect(200);
  await admin.post('/api/auth/change-password', { currentPassword: 'admin123', newPassword: 'admin456' }).expect(200);

  const newClient = () => makeClient(app);

  async function loginAs(username: string, role: 'manager' | 'cashier') {
    await admin
      .post('/api/users', { username, fullName: `${role} user`, role, password: 'secret1' })
      .expect(201);
    const c = makeClient(app);
    await c.post('/api/auth/login', { username, password: 'secret1' }).expect(200);
    await c.post('/api/auth/change-password', { currentPassword: 'secret1', newPassword: 'secret2' }).expect(200);
    return c;
  }

  const lookup = {
    category: (name: string) => one<{ id: number }>(db, 'SELECT id FROM categories WHERE name = ?', [name])!.id,
    sub: (name: string) => one<{ id: number }>(db, 'SELECT id FROM subcategories WHERE name = ?', [name])!.id,
    unit: (symbol: string) => one<{ id: number }>(db, 'SELECT id FROM units WHERE symbol = ?', [symbol])!.id,
    brand: (name: string) => one<{ id: number }>(db, 'SELECT id FROM brands WHERE name = ?', [name])!.id,
    tax: () => one<{ id: number }>(db, 'SELECT id FROM tax_rates WHERE is_default = 1')!.id,
    exempt: () => one<{ id: number }>(db, 'SELECT id FROM tax_rates WHERE rate = 0')!.id,
  };

  async function createProduct(overrides: Record<string, unknown> = {}) {
    const res = await admin
      .post('/api/products', {
        name: 'Lucky OPC Cement',
        categoryId: lookup.category('Cement'),
        subcategoryId: lookup.sub('OPC Cement'),
        brandId: lookup.brand('Lucky'),
        size: '50 KG',
        unitId: lookup.unit('bag'),
        purchasePrice: 138000,
        salePrice: 145000,
        taxRateId: lookup.tax(),
        openingStock: 100,
        minStock: 10,
        ...overrides,
      })
      .expect(201);
    return res.body;
  }

  async function createCustomer(overrides: Record<string, unknown> = {}) {
    const res = await admin
      .post('/api/customers', { name: 'Haji Aslam', phone: '0300-1234567', customerType: 'contractor', ...overrides })
      .expect(201);
    return res.body;
  }

  async function createSupplier(overrides: Record<string, unknown> = {}) {
    const res = await admin.post('/api/suppliers', { name: 'Khan Traders', ...overrides }).expect(201);
    return res.body;
  }

  return { ctx, db, app, admin, newClient, loginAs, lookup, createProduct, createCustomer, createSupplier };
}

export function stockOf(db: AppContext['db'], productId: number): number {
  return one<{ stock_qty: number }>(db, 'SELECT stock_qty FROM products WHERE id = ?', [productId])!.stock_qty;
}
