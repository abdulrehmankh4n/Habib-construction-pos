import {
  PAYMENT_METHOD_LABELS,
  formatDateDMY,
  formatNumber,
  formatRupees,
  normalizePkPhone,
  renderTemplate,
  type PaymentMethod,
} from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, type DB } from '../db';
import { badRequest, notFound, unprocessable } from '../lib/errors';
import { getSettings } from '../lib/settings';
import { nowLocal } from '../lib/time';
import { customerBalance } from './ledger';

export type Channel = 'sms' | 'whatsapp';

export interface RenderedMessage {
  phone: string | null;
  message: string;
  customerId: number | null;
  referenceType: string;
  referenceId: number;
}

function shopVars(db: DB) {
  const s = getSettings(db);
  return { shopName: s.shop.name, shopPhone: s.shop.phone };
}

function tidy(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderSaleMessage(db: DB, saleId: number, channel: Channel): RenderedMessage {
  const sale = one<{
    id: number;
    invoice_no: string;
    sale_date: string;
    customer_id: number | null;
    customer_name: string | null;
    customer_phone: string | null;
    grand_total: number;
    paid_amount: number;
    balance_due: number;
    status: string;
  }>(
    db,
    `SELECT id, invoice_no, sale_date, customer_id, customer_name, customer_phone, grand_total, paid_amount,
       balance_due, status FROM sales WHERE id = ?`,
    [saleId],
  );
  if (!sale) throw notFound('Sale');
  const items = all<{ product_name: string; qty: number; unit_name: string; line_total: number }>(
    db,
    'SELECT product_name, qty, unit_name, line_total FROM sale_items WHERE sale_id = ? ORDER BY id',
    [saleId],
  );
  const itemLines =
    channel === 'whatsapp'
      ? items.map((i) => `- ${i.product_name} x ${formatNumber(i.qty)} ${i.unit_name} = ${formatRupees(i.line_total)}`).join('\n')
      : '';
  const current = sale.customer_id ? customerBalance(db, sale.customer_id) : null;
  const template = getSettings(db).notifications.saleTemplate;
  const message = renderTemplate(template, {
    ...shopVars(db),
    customerName: sale.customer_name ?? 'Customer',
    invoiceNo: sale.invoice_no,
    date: `${formatDateDMY(sale.sale_date)} ${sale.sale_date.slice(11, 16)}`,
    items: itemLines,
    total: formatRupees(sale.grand_total),
    paid: formatRupees(sale.paid_amount),
    balanceDue: formatRupees(sale.balance_due),
    currentBalance: current === null ? formatRupees(sale.balance_due) : formatRupees(current),
    status: sale.status === 'void' ? 'CANCELLED' : '',
  });
  return {
    phone: sale.customer_phone,
    message: tidy(message),
    customerId: sale.customer_id,
    referenceType: 'sale',
    referenceId: sale.id,
  };
}

export function renderPaymentMessage(db: DB, paymentId: number): RenderedMessage {
  const p = one<{
    id: number;
    payment_no: string;
    amount: number;
    method: PaymentMethod;
    payment_date: string;
    customer_id: number | null;
    name: string | null;
    phone: string | null;
  }>(
    db,
    `SELECT p.id, p.payment_no, p.amount, p.method, p.payment_date, p.customer_id, c.name, c.phone
     FROM payments p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ?`,
    [paymentId],
  );
  if (!p) throw notFound('Payment');
  if (!p.customer_id) throw unprocessable('Messages can only be sent for customer payments');
  const message = renderTemplate(getSettings(db).notifications.paymentTemplate, {
    ...shopVars(db),
    customerName: p.name ?? 'Customer',
    amount: formatRupees(p.amount),
    method: PAYMENT_METHOD_LABELS[p.method],
    date: formatDateDMY(p.payment_date),
    paymentNo: p.payment_no,
    currentBalance: formatRupees(customerBalance(db, p.customer_id)),
  });
  return { phone: p.phone, message: tidy(message), customerId: p.customer_id, referenceType: 'payment', referenceId: p.id };
}

export function renderReminderMessage(db: DB, customerId: number): RenderedMessage {
  const c = one<{ id: number; name: string; phone: string | null }>(
    db,
    'SELECT id, name, phone FROM customers WHERE id = ?',
    [customerId],
  );
  if (!c) throw notFound('Customer');
  const agreement = one<{ due_date: string }>(
    db,
    "SELECT due_date FROM credit_agreements WHERE customer_id = ? AND status = 'active' ORDER BY due_date LIMIT 1",
    [customerId],
  );
  const message = renderTemplate(getSettings(db).notifications.reminderTemplate, {
    ...shopVars(db),
    customerName: c.name,
    currentBalance: formatRupees(customerBalance(db, customerId)),
    dueDateLine: agreement ? `Due date: ${formatDateDMY(agreement.due_date)}. ` : '',
  });
  return { phone: c.phone, message: tidy(message), customerId, referenceType: 'customer', referenceId: customerId };
}

export function whatsappUrl(phone: string | null, message: string): string {
  const intl = normalizePkPhone(phone, 'international');
  return `https://wa.me/${intl ?? ''}?text=${encodeURIComponent(message)}`;
}

export function logNotification(
  db: DB,
  entry: {
    channel: Channel;
    recipient: string;
    message: string;
    status: 'sent' | 'failed' | 'opened';
    error?: string | null;
    referenceType?: string | null;
    referenceId?: number | null;
    customerId?: number | null;
    userId?: number | null;
  },
) {
  run(
    db,
    `INSERT INTO notifications (channel, recipient, message, status, error, reference_type, reference_id, customer_id,
       created_by, created_at)
     VALUES (@channel, @recipient, @message, @status, @error, @referenceType, @referenceId, @customerId, @userId, @now)`,
    { ...entry, now: nowLocal() },
  );
}

function parseHeaders(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw unprocessable('SMS gateway headers must be valid JSON, e.g. {"Authorization": "Bearer KEY"}');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw unprocessable('SMS gateway headers must be a JSON object');
  }
  return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
}

function fill(template: string, phone: string, message: string, encode: (v: string) => string): string {
  return template.replace(/\{phone\}/g, encode(phone)).replace(/\{message\}/g, encode(message));
}

const jsonEscape = (v: string) => JSON.stringify(v).slice(1, -1);

export async function sendSms(ctx: AppContext, rawPhone: string, message: string): Promise<{ ok: boolean; error?: string; phone: string }> {
  const s = getSettings(ctx.db).notifications;
  if (!s.smsEnabled) throw unprocessable('SMS is not enabled. Configure an SMS gateway in Settings > Notifications.');
  if (!s.smsUrl) throw unprocessable('SMS gateway URL is not configured');
  const phone = normalizePkPhone(rawPhone, s.smsPhoneFormat);
  if (!phone) throw badRequest('Enter a valid Pakistani mobile number (03XX-XXXXXXX)');
  const headers = parseHeaders(s.smsHeaders);
  const url = fill(s.smsUrl, phone, message, encodeURIComponent);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let res: Response;
    if (s.smsMethod === 'GET') {
      res = await fetch(url, { headers, signal: controller.signal });
    } else {
      const contentTypeKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
      const contentType = contentTypeKey ? headers[contentTypeKey] : 'application/x-www-form-urlencoded';
      if (!contentTypeKey) headers['Content-Type'] = contentType;
      const body = fill(s.smsBody, phone, message, contentType.includes('json') ? jsonEscape : encodeURIComponent);
      res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    }
    const text = (await res.text()).slice(0, 300);
    if (!res.ok) return { ok: false, error: `Gateway returned HTTP ${res.status}: ${text}`, phone };
    return { ok: true, phone };
  } catch (err) {
    return {
      ok: false,
      error: controller.signal.aborted ? 'SMS gateway did not respond in time' : (err as Error).message,
      phone,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendAndLog(
  ctx: AppContext,
  rendered: RenderedMessage,
  phoneOverride: string | null,
  userId: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const phone = phoneOverride ?? rendered.phone;
  if (!phone) return { ok: false, error: 'No phone number' };
  let result: { ok: boolean; error?: string; phone?: string };
  try {
    result = await sendSms(ctx, phone, rendered.message);
  } catch (err) {
    result = { ok: false, error: (err as Error).message };
  }
  logNotification(ctx.db, {
    channel: 'sms',
    recipient: result.phone ?? phone,
    message: rendered.message,
    status: result.ok ? 'sent' : 'failed',
    error: result.error ?? null,
    referenceType: rendered.referenceType,
    referenceId: rendered.referenceId,
    customerId: rendered.customerId,
    userId,
  });
  return result;
}

export function autoSms(ctx: AppContext, kind: 'sale' | 'payment', id: number, userId: number) {
  const s = getSettings(ctx.db).notifications;
  if (!s.smsEnabled || !s.smsUrl) return;
  if (kind === 'sale' && !s.autoSmsOnSale) return;
  if (kind === 'payment' && !s.autoSmsOnPayment) return;
  let rendered: RenderedMessage;
  try {
    rendered = kind === 'sale' ? renderSaleMessage(ctx.db, id, 'sms') : renderPaymentMessage(ctx.db, id);
  } catch {
    return;
  }
  if (!normalizePkPhone(rendered.phone, 'local')) return;
  sendAndLog(ctx, rendered, null, userId).catch((err) => ctx.logger.warn({ err }, 'automatic SMS failed'));
}
