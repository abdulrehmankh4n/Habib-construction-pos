import { describe, expect, it } from 'vitest';
import { one } from '../src/db';
import { todayLocal } from '../src/lib/time';
import { setup, stockOf } from './helpers';

describe('purchases', () => {
  it('receives stock with landed cost, weighted average cost and supplier payable', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const supplier = await t.createSupplier();
    const purchase = (
      await t.admin
        .post('/api/purchases', {
          supplierId: supplier.id,
          supplierInvoiceNo: 'B-5521',
          items: [{ productId: p.id, unitId: p.unitId, qty: 100, unitCost: 140000, newSalePrice: 148000 }],
          freightCharges: 100000,
          payments: [{ method: 'cash', amount: 5000000 }],
        })
        .expect(201)
    ).body;
    expect(purchase.purchaseNo).toBe('PUR-000001');
    expect(purchase.grandTotal).toBe(14100000);
    expect(purchase.items[0].landedUnitCost).toBe(141000);
    expect(stockOf(t.db, p.id)).toBe(200);

    const row = one<{ cost_price: number; purchase_price: number; sale_price: number }>(
      t.db,
      'SELECT cost_price, purchase_price, sale_price FROM products WHERE id = ?',
      [p.id],
    )!;
    expect(row.cost_price).toBe(139500);
    expect(row.purchase_price).toBe(140000);
    expect(row.sale_price).toBe(148000);

    const s1 = (await t.admin.get(`/api/suppliers/${supplier.id}`).expect(200)).body;
    expect(s1.balance).toBe(9100000);

    const withReturn = (
      await t.admin
        .post(`/api/purchases/${purchase.id}/returns`, {
          items: [{ purchaseItemId: purchase.items[0].id, qty: 10 }],
          refundMethod: 'account',
          reason: 'Damaged bags',
        })
        .expect(201)
    ).body;
    expect(withReturn.returnedTotal).toBe(1400000);
    expect(stockOf(t.db, p.id)).toBe(190);
    const s2 = (await t.admin.get(`/api/suppliers/${supplier.id}`).expect(200)).body;
    expect(s2.balance).toBe(7700000);

    await t.admin.post(`/api/purchases/${purchase.id}/void`, { reason: 'x' }).expect(422);
  });

  it('cancels a purchase and reverses stock and payable', async () => {
    const t = await setup();
    const p = await t.createProduct({ openingStock: 0 });
    const supplier = await t.createSupplier();
    const purchase = (
      await t.admin
        .post('/api/purchases', {
          supplierId: supplier.id,
          items: [{ productId: p.id, unitId: p.unitId, qty: 20, unitCost: 140000 }],
        })
        .expect(201)
    ).body;
    expect(stockOf(t.db, p.id)).toBe(20);
    await t.admin.post(`/api/purchases/${purchase.id}/void`, { reason: 'Entered twice' }).expect(200);
    expect(stockOf(t.db, p.id)).toBe(0);
    const s = (await t.admin.get(`/api/suppliers/${supplier.id}`).expect(200)).body;
    expect(s.balance).toBe(0);
  });

  it('rejects overpayment on purchase', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const supplier = await t.createSupplier();
    const res = await t.admin.post('/api/purchases', {
      supplierId: supplier.id,
      items: [{ productId: p.id, unitId: p.unitId, qty: 1, unitCost: 100000 }],
      payments: [{ method: 'cash', amount: 200000 }],
    });
    expect(res.status).toBe(400);
  });
});

describe('stock adjustments', () => {
  it('adjusts stock by count and records movement', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const res = await t.admin
      .post('/api/inventory/adjustments', { productId: p.id, mode: 'set', qty: 96, reason: 'Physical Count Correction' })
      .expect(201);
    expect(res.body.stockQty).toBe(96);
    const list = (await t.admin.get('/api/inventory/adjustments').expect(200)).body;
    expect(list.data[0].adjustmentType).toBe('out');
    expect(list.data[0].qty).toBe(4);
    await t.admin
      .post('/api/inventory/adjustments', { productId: p.id, mode: 'out', qty: 500, reason: 'Wastage' })
      .expect(422);
  });
});

describe('cash book and reports', () => {
  it('computes expected cash across sales, receipts, expenses and supplier payments', async () => {
    const t = await setup();
    await t.admin.put('/api/settings', { cash: { openingBalance: 1000000 } }).expect(200);
    const p = await t.createProduct();
    const customer = await t.createCustomer({ openingBalance: 500000 });
    const supplier = await t.createSupplier({ openingBalance: 800000 });
    const categories = (await t.admin.get('/api/expenses/categories').expect(200)).body;

    await t.admin
      .post('/api/sales', { items: [{ productId: p.id, unitId: p.unitId, qty: 10, unitPrice: 145000 }], payments: [{ method: 'cash', amount: 1450000 }] })
      .expect(201);
    await t.admin.post(`/api/customers/${customer.id}/payments`, { amount: 300000, method: 'cash' }).expect(201);
    await t.admin.post(`/api/customers/${customer.id}/payments`, { amount: 100000, method: 'jazzcash', reference: 'JC1' }).expect(201);
    await t.admin.post(`/api/suppliers/${supplier.id}/payments`, { amount: 100000, method: 'cash' }).expect(201);
    await t.admin.post('/api/expenses', { categoryId: categories[0].id, amount: 200000, method: 'cash', paidTo: 'Landlord' }).expect(201);

    const today = todayLocal();
    const book = (await t.admin.get(`/api/cashbook?date=${today}`).expect(200)).body;
    expect(book.openingCash).toBe(1000000);
    expect(book.cashIn).toBe(1750000);
    expect(book.cashOut).toBe(300000);
    expect(book.expectedCash).toBe(2450000);
    const jazz = book.methodTotals.find((m: { method: string }) => m.method === 'jazzcash');
    expect(jazz.received).toBe(100000);

    const closed = (await t.admin.post('/api/cashbook/close', { date: today, countedCash: 2440000 }).expect(201)).body;
    expect(closed.closing.difference).toBe(-10000);
    await t.admin.post('/api/cashbook/close', { date: today, countedCash: 2440000 }).expect(409);

    const c = (await t.admin.get(`/api/customers/${customer.id}`).expect(200)).body;
    expect(c.balance).toBe(100000);
    const s = (await t.admin.get(`/api/suppliers/${supplier.id}`).expect(200)).body;
    expect(s.balance).toBe(700000);
  });

  it('produces a consistent profit & loss statement and dashboard', async () => {
    const t = await setup();
    const p = await t.createProduct();
    await t.admin
      .post('/api/sales', { items: [{ productId: p.id, unitId: p.unitId, qty: 10, unitPrice: 145000 }], payments: [{ method: 'cash', amount: 1450000 }] })
      .expect(201);
    const pl = (await t.admin.get('/api/reports/profit-loss').expect(200)).body;
    expect(pl.grossSales).toBe(1450000 - 221186);
    expect(pl.cogs).toBe(1380000);
    expect(pl.grossProfit).toBe(1450000 - 221186 - 1380000);
    expect(pl.taxCollected).toBe(221186);

    const dash = (await t.admin.get('/api/reports/dashboard').expect(200)).body;
    expect(dash.today.salesTotal).toBe(1450000);
    expect(dash.today.salesCount).toBe(1);
    expect(dash.salesTrend).toHaveLength(14);

    const tax = (await t.admin.get('/api/reports/tax').expect(200)).body;
    expect(tax.outputTax).toBe(221186);
    expect(tax.invoices).toHaveLength(1);

    const valuation = (await t.admin.get('/api/reports/inventory-valuation').expect(200)).body;
    expect(valuation.totalCostValue).toBe(90 * 138000);
  });

  it('voids a standalone customer receipt and restores the balance', async () => {
    const t = await setup();
    const customer = await t.createCustomer({ openingBalance: 500000 });
    const pay = (await t.admin.post(`/api/customers/${customer.id}/payments`, { amount: 200000, method: 'cash' }).expect(201)).body;
    expect(pay.balance).toBe(300000);
    await t.admin.post(`/api/payments/${pay.id}/void`, { reason: 'Cheque bounced' }).expect(200);
    const c = (await t.admin.get(`/api/customers/${customer.id}`).expect(200)).body;
    expect(c.balance).toBe(500000);
  });
});

describe('settings & backups', () => {
  it('masks the FBR token and keeps it when the mask is sent back', async () => {
    const t = await setup();
    await t.admin.put('/api/settings', { fbr: { token: 'secret-token', posId: '123456' } }).expect(200);
    const s = (await t.admin.get('/api/settings').expect(200)).body;
    expect(s.fbr.token).toBe('••••••••');
    await t.admin.put('/api/settings', { fbr: { token: '••••••••', posId: '654321' } }).expect(200);
    const raw = one<{ value: string }>(t.db, "SELECT value FROM settings WHERE key = 'app'")!;
    expect(JSON.parse(raw.value).fbr.token).toBe('secret-token');
  });

  it('does not allow sequence numbers to go backwards', async () => {
    const t = await setup();
    await t.admin.put('/api/settings/sequences/sale', { prefix: 'INV-', nextValue: 0, padding: 6 }).expect(400);
    await t.admin.put('/api/settings/sequences/sale', { prefix: 'LHR-', nextValue: 1001, padding: 5 }).expect(200);
    const p = await t.createProduct();
    const sale = (
      await t.admin
        .post('/api/sales', { items: [{ productId: p.id, unitId: p.unitId, qty: 1, unitPrice: 145000 }], payments: [{ method: 'cash', amount: 145000 }] })
        .expect(201)
    ).body;
    expect(sale.invoiceNo).toBe('LHR-01001');
    await t.admin.put('/api/settings/sequences/sale', { prefix: 'LHR-', nextValue: 5, padding: 5 }).expect(422);
  });
});
