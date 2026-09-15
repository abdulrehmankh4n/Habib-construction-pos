import { Router } from 'express';
import { z } from 'zod';
import type { CreditAgreement, NotificationLog, Paginated } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, tx, type DB } from '../db';
import { actorOf, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { badRequest, notFound, unprocessable } from '../lib/errors';
import { idParam, pagination, parse, queryInt, queryString, zs } from '../lib/http';
import { nextNumber } from '../lib/sequences';
import { getSettings } from '../lib/settings';
import { nowLocal, todayLocal } from '../lib/time';
import { customerBalance } from '../services/ledger';
import {
  logNotification,
  renderPaymentMessage,
  renderReminderMessage,
  renderSaleMessage,
  sendAndLog,
  sendSms,
  whatsappUrl,
  type Channel,
  type RenderedMessage,
} from '../services/notifications';

const AGREEMENT_SELECT = `SELECT a.id, a.agreement_no AS agreementNo, a.customer_id AS customerId,
  a.customer_name AS customerName, a.father_name AS fatherName, a.cnic, a.phone, a.address, a.amount,
  a.agreement_date AS agreementDate, a.due_date AS dueDate, a.installments, a.terms,
  a.witness1_name AS witness1Name, a.witness1_cnic AS witness1Cnic, a.witness2_name AS witness2Name,
  a.witness2_cnic AS witness2Cnic, a.status, a.notes, u.full_name AS createdByName, a.created_at AS createdAt
FROM credit_agreements a LEFT JOIN users u ON u.id = a.created_by`;

const agreementSchema = z.object({
  customerId: zs.id,
  fatherName: zs.name(120),
  cnic: zs.cnic.refine((v) => v !== null, 'CNIC is required for a legal agreement'),
  phone: zs.phone,
  address: zs.name(300),
  amount: zs.money.refine((v) => v > 0, 'Amount must be greater than zero'),
  agreementDate: zs.day.optional(),
  dueDate: zs.day,
  installments: z.coerce.number().int().min(1).max(120).default(1),
  terms: zs.text(2000),
  witness1Name: zs.text(120),
  witness1Cnic: zs.cnic,
  witness2Name: zs.text(120),
  witness2Cnic: zs.cnic,
  notes: zs.text(1000),
});

function decorate(db: DB, a: CreditAgreement): CreditAgreement {
  const balance = customerBalance(db, a.customerId);
  return {
    ...a,
    currentBalance: balance,
    isOverdue: a.status === 'active' && a.dueDate < todayLocal() && balance > 0,
  };
}

export function agreementRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;
  router.use(requirePermission('agreements.manage'));

  const get = (id: number) => {
    const row = one<CreditAgreement>(db, `${AGREEMENT_SELECT} WHERE a.id = ?`, [id]);
    if (!row) throw notFound('Agreement');
    return decorate(db, row);
  };

  router.get('/', (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const params = {
      customerId: queryInt(req.query, 'customerId') ?? null,
      status: queryString(req.query, 'status') ?? null,
    };
    const where = `WHERE (@customerId IS NULL OR a.customer_id = @customerId) AND (@status IS NULL OR a.status = @status)`;
    const total = one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM credit_agreements a ${where}`, params)!.n;
    let data = all<CreditAgreement>(
      db,
      `${AGREEMENT_SELECT} ${where} ORDER BY CASE a.status WHEN 'active' THEN 0 ELSE 1 END, a.due_date LIMIT @limit OFFSET @offset`,
      { ...params, limit: pageSize, offset },
    ).map((a) => decorate(db, a));
    if (queryString(req.query, 'overdue') === 'true') data = data.filter((a) => a.isOverdue);
    res.json({ data, total, page, pageSize } satisfies Paginated<CreditAgreement>);
  });

  router.get('/:id', (req, res) => {
    res.json(get(idParam(req)));
  });

  router.post('/', (req, res) => {
    const body = parse(agreementSchema, req.body);
    const actor = actorOf(req);
    const id = tx(db, () => {
      const customer = one<{ id: number; name: string; father_name: string | null; cnic: string | null; address: string | null; phone: string | null }>(
        db,
        'SELECT id, name, father_name, cnic, address, phone FROM customers WHERE id = ?',
        [body.customerId],
      );
      if (!customer) throw badRequest('Customer not found');
      const agreementDate = body.agreementDate ?? todayLocal();
      if (body.dueDate < agreementDate) throw badRequest('Due date must be after the agreement date');
      const now = nowLocal();
      const agreementNo = nextNumber(db, 'agreement');
      const r = run(
        db,
        `INSERT INTO credit_agreements (agreement_no, customer_id, customer_name, father_name, cnic, phone, address, amount,
           agreement_date, due_date, installments, terms, witness1_name, witness1_cnic, witness2_name, witness2_cnic,
           status, notes, created_by, created_at, updated_at)
         VALUES (@agreementNo, @customerId, @customerName, @fatherName, @cnic, @phone, @address, @amount,
           @agreementDate, @dueDate, @installments, @terms, @witness1Name, @witness1Cnic, @witness2Name, @witness2Cnic,
           'active', @notes, @userId, @now, @now)`,
        {
          ...body,
          agreementNo,
          customerName: customer.name,
          phone: body.phone ?? customer.phone,
          agreementDate,
          userId: actor.id,
          now,
        },
      );
      run(
        db,
        `UPDATE customers SET father_name = COALESCE(father_name, @fatherName), cnic = COALESCE(cnic, @cnic),
           address = COALESCE(address, @address), updated_at = @now WHERE id = @id`,
        { fatherName: body.fatherName, cnic: body.cnic, address: body.address, now, id: customer.id },
      );
      audit(db, actor, 'agreement.create', 'agreement', r.lastInsertRowid, { agreementNo, amount: body.amount });
      return Number(r.lastInsertRowid);
    });
    res.status(201).json(get(id));
  });

  router.put('/:id', (req, res) => {
    const id = idParam(req);
    const body = parse(agreementSchema, req.body);
    tx(db, () => {
      const current = one<{ status: string; customer_id: number }>(
        db,
        'SELECT status, customer_id FROM credit_agreements WHERE id = ?',
        [id],
      );
      if (!current) throw notFound('Agreement');
      if (current.status !== 'active') throw unprocessable('Only active agreements can be edited');
      if (current.customer_id !== body.customerId) throw badRequest('Customer cannot be changed');
      run(
        db,
        `UPDATE credit_agreements SET father_name = @fatherName, cnic = @cnic, phone = @phone, address = @address,
           amount = @amount, agreement_date = COALESCE(@agreementDate, agreement_date), due_date = @dueDate,
           installments = @installments, terms = @terms, witness1_name = @witness1Name, witness1_cnic = @witness1Cnic,
           witness2_name = @witness2Name, witness2_cnic = @witness2Cnic, notes = @notes, updated_at = @now
         WHERE id = @id`,
        { ...body, agreementDate: body.agreementDate ?? null, id, now: nowLocal() },
      );
      audit(db, actorOf(req), 'agreement.update', 'agreement', id);
    });
    res.json(get(id));
  });

  router.post('/:id/status', (req, res) => {
    const id = idParam(req);
    const body = parse(z.object({ status: z.enum(['active', 'settled', 'cancelled']) }), req.body);
    tx(db, () => {
      const r = run(db, 'UPDATE credit_agreements SET status = ?, updated_at = ? WHERE id = ?', [body.status, nowLocal(), id]);
      if (r.changes === 0) throw notFound('Agreement');
      audit(db, actorOf(req), 'agreement.status', 'agreement', id, body);
    });
    res.json(get(id));
  });

  return router;
}

export function notificationRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  const render = (type: string, id: number, channel: Channel): RenderedMessage => {
    if (type === 'sale') return renderSaleMessage(db, id, channel);
    if (type === 'payment') return renderPaymentMessage(db, id);
    if (type === 'reminder') return renderReminderMessage(db, id);
    throw badRequest('Unknown message type');
  };

  router.get('/preview', requirePermission('notifications.send'), (req, res) => {
    const type = queryString(req.query, 'type') ?? '';
    const id = queryInt(req.query, 'id');
    if (!id) throw badRequest('id is required');
    const channel = queryString(req.query, 'channel') === 'sms' ? 'sms' : 'whatsapp';
    const rendered = render(type, id, channel);
    const settings = getSettings(db).notifications;
    res.json({
      ...rendered,
      whatsappUrl: whatsappUrl(rendered.phone, rendered.message),
      smsEnabled: settings.smsEnabled && !!settings.smsUrl,
      whatsappEnabled: settings.whatsappEnabled,
    });
  });

  router.post('/sms', requirePermission('notifications.send'), async (req, res) => {
    const body = parse(
      z.object({
        type: z.enum(['sale', 'payment', 'reminder']),
        id: zs.id,
        phone: zs.phone,
        message: z.string().trim().min(1).max(1500).optional(),
      }),
      req.body,
    );
    const rendered = render(body.type, body.id, 'sms');
    if (body.message) rendered.message = body.message;
    const result = await sendAndLog(ctx, rendered, body.phone ?? null, req.user!.id);
    if (!result.ok) throw unprocessable(`SMS could not be sent: ${result.error}`);
    res.json({ ok: true });
  });

  router.post('/whatsapp-log', requirePermission('notifications.send'), (req, res) => {
    const body = parse(
      z.object({
        type: z.enum(['sale', 'payment', 'reminder']),
        id: zs.id,
        phone: zs.phone,
        message: z.string().trim().min(1).max(4000),
      }),
      req.body,
    );
    const rendered = render(body.type, body.id, 'whatsapp');
    logNotification(db, {
      channel: 'whatsapp',
      recipient: body.phone ?? rendered.phone ?? '-',
      message: body.message,
      status: 'opened',
      referenceType: rendered.referenceType,
      referenceId: rendered.referenceId,
      customerId: rendered.customerId,
      userId: req.user!.id,
    });
    res.json({ ok: true });
  });

  router.post('/test-sms', requirePermission('settings.manage'), async (req, res) => {
    const body = parse(z.object({ phone: z.string().trim().min(7).max(20) }), req.body);
    const shop = getSettings(db).shop.name;
    const result = await sendSms(ctx, body.phone, `Test message from ${shop} POS. SMS gateway is working.`);
    logNotification(db, {
      channel: 'sms',
      recipient: result.phone,
      message: 'Test message',
      status: result.ok ? 'sent' : 'failed',
      error: result.error ?? null,
      referenceType: 'test',
      userId: req.user!.id,
    });
    if (!result.ok) throw unprocessable(`Test SMS failed: ${result.error}`);
    res.json({ ok: true });
  });

  router.get('/', requirePermission('settings.manage', 'reports.view'), (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const total = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM notifications')!.n;
    const data = all<NotificationLog>(
      db,
      `SELECT n.id, n.channel, n.recipient, n.message, n.status, n.error, n.reference_type AS referenceType,
         n.reference_id AS referenceId, c.name AS customerName, u.full_name AS createdByName, n.created_at AS createdAt
       FROM notifications n LEFT JOIN customers c ON c.id = n.customer_id LEFT JOIN users u ON u.id = n.created_by
       ORDER BY n.id DESC LIMIT @limit OFFSET @offset`,
      { limit: pageSize, offset },
    );
    res.json({ data, total, page, pageSize } satisfies Paginated<NotificationLog>);
  });

  return router;
}
