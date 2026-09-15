import { describe, expect, it } from 'vitest';
import { setup, stockOf } from './helpers';

const item = (productId: number, unitId: number, qty: number, unitPrice: number, discount = 0) => ({
  productId,
  unitId,
  qty,
  unitPrice,
  discount,
});

describe('POS sales', () => {
  it('completes a walk-in cash sale with change, GST extraction and stock deduction', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const res = await t.admin
      .post('/api/sales', {
        items: [item(p.id, p.unitId, 10, 145000)],
        payments: [{ method: 'cash', amount: 1500000 }],
      })
      .expect(201);
    const sale = res.body;
    expect(sale.invoiceNo).toBe('INV-000001');
    expect(sale.grandTotal).toBe(1450000);
    expect(sale.taxTotal).toBe(221186);
    expect(sale.changeDue).toBe(50000);
    expect(sale.paidAmount).toBe(1450000);
    expect(sale.balanceDue).toBe(0);
    expect(sale.payments).toHaveLength(1);
    expect(sale.payments[0].amount).toBe(1450000);
    expect(stockOf(t.db, p.id)).toBe(90);
  });

  it('sells in alternate units (sand by trolley) and deducts base quantity', async () => {
    const t = await setup();
    const trolley = t.lookup.unit('trolley');
    const p = await t.createProduct({
      name: 'Ravi Sand',
      categoryId: t.lookup.category('Sand'),
      subcategoryId: t.lookup.sub('Ravi Sand'),
      brandId: null,
      unitId: t.lookup.unit('cft'),
      purchasePrice: 4500,
      salePrice: 6000,
      openingStock: 1000,
      taxRateId: t.lookup.exempt(),
      units: [{ unitId: trolley, factor: 150 }],
    });
    const res = await t.admin
      .post('/api/sales', {
        items: [item(p.id, trolley, 2, 900000)],
        deliveryCharges: 150000,
        payments: [{ method: 'cash', amount: 1950000 }],
        delivery: { required: true, vehicleNo: 'LES-1234', driverName: 'Akram' },
      })
      .expect(201);
    expect(res.body.grandTotal).toBe(1950000);
    expect(res.body.deliveryStatus).toBe('pending');
    expect(res.body.items[0].baseQty).toBe(300);
    expect(stockOf(t.db, p.id)).toBe(700);
  });

  it('rejects fractional quantities for whole-number units', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const res = await t.admin.post('/api/sales', {
      items: [item(p.id, p.unitId, 1.5, 145000)],
      payments: [{ method: 'cash', amount: 300000 }],
    });
    expect(res.status).toBe(400);
  });

  it('blocks overselling when negative stock is disabled', async () => {
    const t = await setup();
    const p = await t.createProduct({ openingStock: 5 });
    const res = await t.admin.post('/api/sales', {
      items: [item(p.id, p.unitId, 6, 145000)],
      payments: [{ method: 'cash', amount: 870000 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/Insufficient stock/);
    expect(stockOf(t.db, p.id)).toBe(5);
  });

  it('requires a registered customer for credit and enforces the credit limit', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const walkIn = await t.admin.post('/api/sales', {
      items: [item(p.id, p.unitId, 1, 145000)],
      payments: [{ method: 'cash', amount: 100000 }],
    });
    expect(walkIn.status).toBe(422);

    const customer = await t.createCustomer({ creditLimit: 1000000 });
    const cashier = await t.loginAs('counter', 'cashier');
    const first = await cashier
      .post('/api/sales', {
        customerId: customer.id,
        items: [item(p.id, p.unitId, 10, 145000)],
        payments: [{ method: 'cash', amount: 500000 }],
      })
      .expect(201);
    expect(first.body.balanceDue).toBe(950000);
    expect(first.body.customerBalance).toBe(950000);

    const second = await cashier.post('/api/sales', {
      customerId: customer.id,
      items: [item(p.id, p.unitId, 1, 145000)],
    });
    expect(second.status).toBe(422);
    expect(second.body.error.message).toMatch(/Credit limit exceeded/);

    const statement = (await t.admin.get(`/api/customers/${customer.id}/statement`).expect(200)).body;
    expect(statement.closingBalance).toBe(950000);
    expect(statement.entries.map((e: { entryType: string }) => e.entryType)).toEqual(['sale', 'payment']);
  });

  it('enforces minimum sale price for cashiers but allows managers to override', async () => {
    const t = await setup();
    const p = await t.createProduct({ minSalePrice: 142000 });
    const cashier = await t.loginAs('cashier2', 'cashier');
    const low = await cashier.post('/api/sales', {
      items: [item(p.id, p.unitId, 1, 140000)],
      payments: [{ method: 'cash', amount: 140000 }],
    });
    expect(low.status).toBe(422);
    const disc = await cashier.post('/api/sales', {
      items: [item(p.id, p.unitId, 1, 145000, 5000)],
      payments: [{ method: 'cash', amount: 140000 }],
    });
    expect(disc.status).toBe(422);
    await t.admin
      .post('/api/sales', { items: [item(p.id, p.unitId, 1, 140000)], payments: [{ method: 'cash', amount: 140000 }] })
      .expect(201);
  });

  it('prevents cashiers selling below cost when no minimum price is set', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const cashier = await t.loginAs('cashier3', 'cashier');
    const res = await cashier.post('/api/sales', {
      items: [item(p.id, p.unitId, 1, 130000)],
      payments: [{ method: 'cash', amount: 130000 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.message).not.toMatch(/1,380/);
  });

  it('does not allow change from non-cash payments', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const res = await t.admin.post('/api/sales', {
      items: [item(p.id, p.unitId, 1, 145000)],
      payments: [{ method: 'jazzcash', amount: 150000 }],
    });
    expect(res.status).toBe(400);
  });

  it('splits payment across methods', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const res = await t.admin
      .post('/api/sales', {
        items: [item(p.id, p.unitId, 4, 145000)],
        payments: [
          { method: 'easypaisa', amount: 300000, reference: 'TXN123' },
          { method: 'cash', amount: 300000 },
        ],
      })
      .expect(201);
    expect(res.body.changeDue).toBe(20000);
    const byMethod = Object.fromEntries(res.body.payments.map((x: { method: string; amount: number }) => [x.method, x.amount]));
    expect(byMethod).toEqual({ easypaisa: 300000, cash: 280000 });
  });
});

describe('returns and cancellations', () => {
  it('handles partial returns with refunds, restocking and ledger entries', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const customer = await t.createCustomer();
    const sale = (
      await t.admin
        .post('/api/sales', {
          customerId: customer.id,
          items: [item(p.id, p.unitId, 10, 145000)],
          payments: [{ method: 'cash', amount: 1450000 }],
        })
        .expect(201)
    ).body;
    const saleItemId = sale.items[0].id;

    const r1 = await t.admin
      .post(`/api/sales/${sale.id}/returns`, {
        items: [{ saleItemId, qty: 3, restock: true }],
        refundMethod: 'cash',
        reason: 'Extra bags',
      })
      .expect(201);
    expect(r1.body.totalAmount).toBe(435000);
    expect(stockOf(t.db, p.id)).toBe(93);

    const tooMany = await t.admin.post(`/api/sales/${sale.id}/returns`, {
      items: [{ saleItemId, qty: 8, restock: true }],
      refundMethod: 'cash',
    });
    expect(tooMany.status).toBe(422);

    const r2 = await t.admin
      .post(`/api/sales/${sale.id}/returns`, {
        items: [{ saleItemId, qty: 7, restock: false }],
        refundMethod: 'account',
        reason: 'Damaged',
      })
      .expect(201);
    expect(r2.body.totalAmount).toBe(1015000);
    expect(stockOf(t.db, p.id)).toBe(93);

    const c = (await t.admin.get(`/api/customers/${customer.id}`).expect(200)).body;
    expect(c.balance).toBe(-1015000);

    const detail = (await t.admin.get(`/api/sales/${sale.id}`).expect(200)).body;
    expect(detail.returnedTotal).toBe(1450000);
    expect(detail.items[0].returnedQty).toBe(10);

    const voidRes = await t.admin.post(`/api/sales/${sale.id}/void`, { reason: 'test' });
    expect(voidRes.status).toBe(422);
  });

  it('voids a sale: restores stock, reverses ledger and voids payments', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const customer = await t.createCustomer({ openingBalance: 100000 });
    const sale = (
      await t.admin
        .post('/api/sales', {
          customerId: customer.id,
          items: [item(p.id, p.unitId, 10, 145000)],
          payments: [{ method: 'cash', amount: 500000 }],
        })
        .expect(201)
    ).body;
    expect(stockOf(t.db, p.id)).toBe(90);

    const cashier = await t.loginAs('cashier4', 'cashier');
    await cashier.post(`/api/sales/${sale.id}/void`, { reason: 'Wrong entry' }).expect(403);

    const voided = (await t.admin.post(`/api/sales/${sale.id}/void`, { reason: 'Wrong entry' }).expect(200)).body;
    expect(voided.status).toBe('void');
    expect(voided.payments.every((x: { isVoid: boolean }) => x.isVoid)).toBe(true);
    expect(stockOf(t.db, p.id)).toBe(100);
    const c = (await t.admin.get(`/api/customers/${customer.id}`).expect(200)).body;
    expect(c.balance).toBe(100000);
    await t.admin.post(`/api/sales/${sale.id}/void`, { reason: 'again' }).expect(422);
  });
});

describe('quotations and held bills', () => {
  it('converts a quotation into a sale exactly once', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const q = (
      await t.admin
        .post('/api/quotations', {
          customerName: 'Site Engineer',
          items: [item(p.id, p.unitId, 50, 143000)],
          deliveryCharges: 200000,
        })
        .expect(201)
    ).body;
    expect(q.quotationNo).toBe('QT-000001');
    expect(q.grandTotal).toBe(50 * 143000 + 200000);
    expect(stockOf(t.db, p.id)).toBe(100);

    await t.admin
      .post('/api/sales', {
        quotationId: q.id,
        items: [item(p.id, p.unitId, 50, 143000)],
        deliveryCharges: 200000,
        payments: [{ method: 'bank_transfer', amount: q.grandTotal, reference: 'HBL-889' }],
      })
      .expect(201);
    const after = (await t.admin.get(`/api/quotations/${q.id}`).expect(200)).body;
    expect(after.status).toBe('converted');
    expect(after.saleInvoiceNo).toBe('INV-000001');

    const again = await t.admin.post('/api/sales', {
      quotationId: q.id,
      items: [item(p.id, p.unitId, 1, 145000)],
      payments: [{ method: 'cash', amount: 145000 }],
    });
    expect(again.status).toBe(422);
  });

  it('stores and removes held bills', async () => {
    const t = await setup();
    const created = await t.admin
      .post('/api/held-bills', { label: 'Contractor list', total: 100, payload: { items: [] } })
      .expect(201);
    const list = (await t.admin.get('/api/held-bills').expect(200)).body;
    expect(list).toHaveLength(1);
    await t.admin.del(`/api/held-bills/${created.body.id}`).expect(200);
    expect((await t.admin.get('/api/held-bills').expect(200)).body).toHaveLength(0);
  });
});
