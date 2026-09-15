import { describe, expect, it } from 'vitest';
import { setup } from './helpers';

describe('authentication & security', () => {
  it('rejects wrong credentials and enforces password change on first login', async () => {
    const t = await setup();
    const c = t.newClient();
    await c.post('/api/auth/login', { username: 'admin', password: 'wrong' }).expect(401);

    await t.admin.post('/api/users', { username: 'ali', fullName: 'Ali', role: 'cashier', password: 'secret1' }).expect(201);
    await c.post('/api/auth/login', { username: 'ali', password: 'secret1' }).expect(200);
    const blocked = await c.get('/api/products').expect(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await c.post('/api/auth/change-password', { currentPassword: 'secret1', newPassword: 'secret2' }).expect(200);
    await c.get('/api/products').expect(200);
  });

  it('requires the client header for state-changing requests', async () => {
    const t = await setup();
    const res = await t.admin.agent.post('/api/customers').send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated access', async () => {
    const t = await setup();
    await t.newClient().get('/api/sales').expect(401);
  });

  it('invalidates sessions when a user is deactivated', async () => {
    const t = await setup();
    const cashier = await t.loginAs('bilal', 'cashier');
    const users = await t.admin.get('/api/users').expect(200);
    const bilal = users.body.find((u: { username: string }) => u.username === 'bilal');
    await t.admin.put(`/api/users/${bilal.id}`, { fullName: 'Bilal', role: 'cashier', isActive: false }).expect(200);
    await cashier.get('/api/products').expect(401);
  });

  it('enforces role permissions', async () => {
    const t = await setup();
    const cashier = await t.loginAs('cash1', 'cashier');
    await cashier.get('/api/reports/profit-loss').expect(403);
    await cashier.get('/api/users').expect(403);
    await cashier.put('/api/settings', { shop: { name: 'Hack' } }).expect(403);
  });
});

describe('catalog', () => {
  it('seeds the category tree, units and GST', async () => {
    const t = await setup();
    const cats = (await t.admin.get('/api/catalog/categories').expect(200)).body;
    expect(cats).toHaveLength(17);
    const cement = cats.find((c: { name: string }) => c.name === 'Cement');
    expect(cement.subcategories.map((s: { name: string }) => s.name)).toContain('OPC Cement');
    const units = (await t.admin.get('/api/catalog/units').expect(200)).body.map((u: { symbol: string }) => u.symbol);
    expect(units).toEqual(expect.arrayContaining(['bag', 'kg', 'cft', 'trolley', 'truck', 'ton']));
    const taxes = (await t.admin.get('/api/catalog/tax-rates').expect(200)).body;
    expect(taxes.find((x: { isDefault: boolean }) => x.isDefault).rate).toBe(18);
  });

  it('creates products with alternate units, opening stock and auto SKU', async () => {
    const t = await setup();
    const p = await t.createProduct({
      name: 'Ravi Sand',
      categoryId: t.lookup.category('Sand'),
      subcategoryId: t.lookup.sub('Ravi Sand'),
      brandId: null,
      unitId: t.lookup.unit('cft'),
      purchasePrice: 4500,
      salePrice: 6000,
      openingStock: 1000,
      units: [
        { unitId: t.lookup.unit('trolley'), factor: 150 },
        { unitId: t.lookup.unit('truck'), factor: 600, salePrice: 3500000 },
      ],
    });
    expect(p.sku).toBe('SAN-0001');
    expect(p.stockQty).toBe(1000);
    expect(p.units).toHaveLength(2);
    const movements = (await t.admin.get(`/api/products/${p.id}/movements`).expect(200)).body;
    expect(movements.data[0].movementType).toBe('opening');
  });

  it('rejects a subcategory from another category', async () => {
    const t = await setup();
    const res = await t.admin.post('/api/products', {
      name: 'Bad',
      categoryId: t.lookup.category('Cement'),
      subcategoryId: t.lookup.sub('Ravi Sand'),
      unitId: t.lookup.unit('bag'),
      salePrice: 100,
      taxRateId: t.lookup.tax(),
    });
    expect(res.status).toBe(400);
  });

  it('hides cost prices from cashiers', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const cashier = await t.loginAs('cashier1', 'cashier');
    const res = await cashier.get(`/api/products/${p.id}`).expect(200);
    expect(res.body.costPrice).toBeUndefined();
    expect(res.body.purchasePrice).toBeUndefined();
    expect(res.body.salePrice).toBe(145000);
  });

  it('searches products by multiple words across brand and subcategory', async () => {
    const t = await setup();
    await t.createProduct();
    await t.createProduct({ name: 'Bestway OPC Cement', brandId: t.lookup.brand('Bestway') });
    const res = await t.admin.get('/api/products?search=lucky%20opc').expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].name).toBe('Lucky OPC Cement');
  });

  it('looks up products by barcode including alternate unit barcodes', async () => {
    const t = await setup();
    const p = await t.createProduct({
      barcode: '8961234567890',
      units: [{ unitId: t.lookup.unit('ton'), factor: 20, barcode: 'TON-001' }],
    });
    const a = await t.admin.get('/api/products/lookup?code=8961234567890').expect(200);
    expect(a.body.product.id).toBe(p.id);
    const b = await t.admin.get('/api/products/lookup?code=TON-001').expect(200);
    expect(b.body.unitId).toBe(t.lookup.unit('ton'));
  });
});
