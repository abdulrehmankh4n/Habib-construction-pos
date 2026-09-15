import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { addDays, todayLocal } from '../src/lib/time';
import { setup } from './helpers';

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('credit agreements (stamp paper)', () => {
  it('creates an agreement, fills missing customer details and flags overdue', async () => {
    const t = await setup();
    const customer = await t.createCustomer({ openingBalance: 25000000 });
    const missingCnic = await t.admin.post('/api/agreements', {
      customerId: customer.id,
      fatherName: 'Muhammad Akram',
      address: 'House 12, Street 4, Township, Lahore',
      amount: 25000000,
      dueDate: addDays(todayLocal(), 90),
    });
    expect(missingCnic.status).toBe(400);

    const created = (
      await t.admin
        .post('/api/agreements', {
          customerId: customer.id,
          fatherName: 'Muhammad Akram',
          cnic: '3520212345671',
          address: 'House 12, Street 4, Township, Lahore',
          amount: 25000000,
          agreementDate: addDays(todayLocal(), -100),
          dueDate: addDays(todayLocal(), -10),
          installments: 3,
          witness1Name: 'Ali Raza',
          witness1Cnic: '35202-7654321-3',
        })
        .expect(201)
    ).body;
    expect(created.agreementNo).toBe('AGR-00001');
    expect(created.cnic).toBe('35202-1234567-1');
    expect(created.isOverdue).toBe(true);
    expect(created.currentBalance).toBe(25000000);

    const c = (await t.admin.get(`/api/customers/${customer.id}`).expect(200)).body;
    expect(c.fatherName).toBe('Muhammad Akram');
    expect(c.cnic).toBe('35202-1234567-1');

    const receivables = (await t.admin.get('/api/reports/receivables').expect(200)).body;
    expect(receivables.overdueTotal).toBe(25000000);

    const settled = (await t.admin.post(`/api/agreements/${created.id}/status`, { status: 'settled' }).expect(200)).body;
    expect(settled.isOverdue).toBe(false);

    const cashier = await t.loginAs('cashier9', 'cashier');
    await cashier.get('/api/agreements').expect(403);
  });
});

describe('zakat', () => {
  it('computes zakat on stock using the chosen valuation basis and saves a snapshot', async () => {
    const t = await setup();
    await t.createProduct({ openingStock: 100, wholesalePrice: 140000 });
    await t.admin.put('/api/settings', { cash: { openingBalance: 0 } }).expect(200);

    const retail = (
      await t.admin
        .post('/api/zakat/compute', {
          valuationBasis: 'retail',
          includeCash: false,
          includeReceivables: false,
          deductPayables: false,
        })
        .expect(200)
    ).body;
    expect(retail.stockValue).toBe(100 * 145000);
    expect(retail.zakatPayable).toBe(Math.round(100 * 145000 * 0.025));

    const wholesale = (
      await t.admin
        .post('/api/zakat/compute', {
          valuationBasis: 'wholesale',
          includeCash: true,
          cashInHand: 1000000,
          bankBalance: 500000,
          includeReceivables: false,
          deductPayables: false,
          otherLiabilities: 1500000,
        })
        .expect(200)
    ).body;
    expect(wholesale.stockValue).toBe(14000000);
    expect(wholesale.netZakatable).toBe(14000000);

    const belowNisab = (
      await t.admin
        .post('/api/zakat/compute', { includeCash: false, includeReceivables: false, deductPayables: false, nisabValue: 999999999 })
        .expect(200)
    ).body;
    expect(belowNisab.meetsNisab).toBe(false);
    expect(belowNisab.zakatPayable).toBe(0);

    const excluded = (
      await t.admin
        .post('/api/zakat/compute', {
          excludeCategoryIds: [t.lookup.category('Cement')],
          includeCash: false,
          includeReceivables: false,
          deductPayables: false,
        })
        .expect(200)
    ).body;
    expect(excluded.stockValue).toBe(0);

    const saved = (
      await t.admin
        .post('/api/zakat/reports', { valuationBasis: 'retail', includeCash: false, includeReceivables: false, deductPayables: false })
        .expect(201)
    ).body;
    expect(saved.snapshot.lines).toHaveLength(1);
    const list = (await t.admin.get('/api/zakat/reports').expect(200)).body;
    expect(list.total).toBe(1);

    const cashier = await t.loginAs('cashier8', 'cashier');
    await cashier.post('/api/zakat/compute', {}).expect(403);
  });
});

describe('product images', () => {
  it('uploads, serves and deletes a product image, rejecting non-images', async () => {
    const t = await setup();
    const p = await t.createProduct();
    await t.admin.agent
      .put(`/api/products/${p.id}/image`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Content-Type', 'image/png')
      .send(Buffer.from('not really an image'))
      .expect(400);
    const up = await t.admin.agent
      .put(`/api/products/${p.id}/image`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Content-Type', 'image/png')
      .send(PNG_1x1)
      .expect(200);
    expect(up.body.imageUrl).toMatch(new RegExp(`^/api/products/${p.id}/image\\?v=`));
    const img = await t.admin.get(up.body.imageUrl).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    const list = (await t.admin.get('/api/products?search=lucky').expect(200)).body;
    expect(list.data[0].imageUrl).toBe(up.body.imageUrl);
    await t.admin.del(`/api/products/${p.id}/image`).expect(200);
    await t.admin.get(`/api/products/${p.id}/image`).expect(404);
  });
});

describe('customer notifications', () => {
  it('renders a WhatsApp receipt with a wa.me link and logs it', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const customer = await t.createCustomer();
    const sale = (
      await t.admin
        .post('/api/sales', {
          customerId: customer.id,
          items: [{ productId: p.id, unitId: p.unitId, qty: 2, unitPrice: 145000 }],
          payments: [{ method: 'cash', amount: 100000 }],
        })
        .expect(201)
    ).body;
    const preview = (await t.admin.get(`/api/notifications/preview?type=sale&id=${sale.id}&channel=whatsapp`).expect(200)).body;
    expect(preview.message).toContain(sale.invoiceNo);
    expect(preview.message).toContain('Lucky OPC Cement x 2 Bag = Rs 2,900');
    expect(preview.message).toContain('Rs 1,900');
    expect(preview.whatsappUrl.startsWith('https://wa.me/923001234567?text=')).toBe(true);

    const sms = (await t.admin.get(`/api/notifications/preview?type=sale&id=${sale.id}&channel=sms`).expect(200)).body;
    expect(sms.message).not.toContain('Lucky OPC Cement x 2');

    await t.admin
      .post('/api/notifications/whatsapp-log', { type: 'sale', id: sale.id, message: preview.message })
      .expect(200);
    const logs = (await t.admin.get('/api/notifications').expect(200)).body;
    expect(logs.data[0].status).toBe('opened');

    const reminder = (await t.admin.get(`/api/notifications/preview?type=reminder&id=${customer.id}`).expect(200)).body;
    expect(reminder.message).toContain('Rs 1,900');
  });

  it('sends SMS through a configured HTTP gateway', async () => {
    const received: string[] = [];
    const gateway = http.createServer((req, res) => {
      received.push(req.url ?? '');
      res.end('OK');
    });
    await new Promise<void>((r) => gateway.listen(0, '127.0.0.1', r));
    const port = (gateway.address() as AddressInfo).port;
    try {
      const t = await setup();
      const customer = await t.createCustomer({ openingBalance: 500000 });
      await t.admin
        .put('/api/settings', {
          notifications: {
            smsEnabled: true,
            smsMethod: 'GET',
            smsUrl: `http://127.0.0.1:${port}/send?to={phone}&text={message}`,
            smsPhoneFormat: 'international',
          },
        })
        .expect(200);
      await t.admin.post('/api/notifications/sms', { type: 'reminder', id: customer.id }).expect(200);
      expect(received).toHaveLength(1);
      expect(received[0]).toContain('to=923001234567');
      expect(decodeURIComponent(received[0])).toContain('Rs 5,000');
    } finally {
      gateway.close();
    }
  });

  it('reports a failure when SMS is not configured', async () => {
    const t = await setup();
    const customer = await t.createCustomer();
    const res = await t.admin.post('/api/notifications/sms', { type: 'reminder', id: customer.id });
    expect(res.status).toBe(422);
  });
});

describe('real-time sync', () => {
  it('broadcasts change topics to connected terminals after a sale', async () => {
    const t = await setup();
    const p = await t.createProduct();
    const topics: string[][] = [];
    const fakeRes = {
      status: () => fakeRes,
      setHeader: () => undefined,
      flushHeaders: () => undefined,
      write: (chunk: string) => {
        const m = /data: (.*)\n/.exec(chunk);
        if (m) topics.push(JSON.parse(m[1]).topics);
        return true;
      },
      end: () => undefined,
    };
    const fakeReq = { on: () => undefined };
    t.ctx.events.subscribe(fakeReq as never, fakeRes as never);
    await t.admin
      .post('/api/sales', {
        items: [{ productId: p.id, unitId: p.unitId, qty: 1, unitPrice: 145000 }],
        payments: [{ method: 'cash', amount: 145000 }],
      })
      .expect(201);
    expect(topics.some((x) => x.includes('products') && x.includes('sales'))).toBe(true);
    const before = topics.length;
    await t.admin.post('/api/sales', { items: [] }).expect(400);
    expect(topics.length).toBe(before);
  });
});
