import type { AppContext } from '../context';
import { all, one, run } from '../db';
import { getSettings } from '../lib/settings';
import { nowLocal } from '../lib/time';

const ENDPOINTS = {
  sandbox: 'https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData',
  production: 'https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData',
} as const;

const MAX_ATTEMPTS = 25;

interface SaleRow {
  id: number;
  invoice_no: string;
  sale_date: string;
  customer_name: string | null;
  customer_phone: string | null;
  cnic: string | null;
  ntn: string | null;
  grand_total: number;
  taxable_value: number;
  tax_total: number;
  item_discount: number;
  bill_discount: number;
  status: string;
  fbr_status: string;
}

interface ItemRow {
  sku: string | null;
  product_name: string;
  qty: number;
  hs_code: string | null;
  tax_rate: number;
  taxable_value: number;
  tax_amount: number;
  line_total: number;
  discount: number;
  bill_discount_share: number;
}

const rs = (paisa: number) => Math.round(paisa) / 100;

function paymentMode(methods: string[]): number {
  const unique = [...new Set(methods)];
  if (unique.length > 1) return 5;
  switch (unique[0]) {
    case 'card':
    case 'bank_transfer':
    case 'jazzcash':
    case 'easypaisa':
      return 2;
    case 'cheque':
      return 6;
    default:
      return 1;
  }
}

export function buildFbrPayload(ctx: AppContext, saleId: number) {
  const { db } = ctx;
  const settings = getSettings(db);
  const sale = one<SaleRow>(
    db,
    `SELECT s.id, s.invoice_no, s.sale_date, s.customer_name, s.customer_phone, c.cnic, c.ntn, s.grand_total,
       s.taxable_value, s.tax_total, s.item_discount, s.bill_discount, s.status, s.fbr_status
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
    [saleId],
  );
  if (!sale) return null;
  const items = all<ItemRow>(
    db,
    `SELECT sku, product_name, qty, hs_code, tax_rate, taxable_value, tax_amount, line_total, discount,
       bill_discount_share FROM sale_items WHERE sale_id = ? ORDER BY id`,
    [saleId],
  );
  const methods = all<{ method: string }>(db, 'SELECT method FROM payments WHERE sale_id = ? AND direction = ?', [
    saleId,
    'in',
  ]).map((m) => m.method);

  return {
    sale,
    payload: {
      InvoiceNumber: '',
      POSID: Number(settings.fbr.posId) || settings.fbr.posId,
      USIN: sale.invoice_no,
      DateTime: sale.sale_date,
      BuyerNTN: sale.ntn ?? '',
      BuyerCNIC: sale.cnic ?? '',
      BuyerName: sale.customer_name ?? '',
      BuyerPhoneNumber: sale.customer_phone ?? '',
      TotalBillAmount: rs(sale.grand_total),
      TotalQuantity: items.reduce((s, i) => s + i.qty, 0),
      TotalSaleValue: rs(sale.taxable_value),
      TotalTaxCharged: rs(sale.tax_total),
      Discount: rs(sale.item_discount + sale.bill_discount),
      FurtherTax: 0,
      PaymentMode: paymentMode(methods),
      RefUSIN: null,
      InvoiceType: 1,
      Items: items.map((i) => ({
        ItemCode: i.sku ?? '',
        ItemName: i.product_name,
        Quantity: i.qty,
        PCTCode: i.hs_code ?? '',
        TaxRate: i.tax_rate,
        SaleValue: rs(i.taxable_value),
        TotalAmount: rs(i.line_total),
        TaxCharged: rs(i.tax_amount),
        Discount: rs(i.discount + i.bill_discount_share),
        FurtherTax: 0,
        InvoiceType: 1,
        RefUSIN: null,
      })),
    },
  };
}

export async function submitSaleToFbr(ctx: AppContext, saleId: number): Promise<void> {
  const { db, logger } = ctx;
  const settings = getSettings(db);
  if (!settings.fbr.enabled) return;
  const built = buildFbrPayload(ctx, saleId);
  if (!built || built.sale.status !== 'completed' || built.sale.fbr_status === 'synced') return;

  const fail = (message: string) => {
    run(
      db,
      "UPDATE sales SET fbr_status = 'failed', fbr_error = ?, fbr_attempts = fbr_attempts + 1, updated_at = ? WHERE id = ?",
      [message.slice(0, 500), nowLocal(), saleId],
    );
    logger.warn({ saleId, message }, 'FBR submission failed');
  };

  if (!settings.fbr.posId || !settings.fbr.token) {
    fail('FBR POS ID or access token is not configured');
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.fbr.timeoutSeconds * 1000);
  try {
    const res = await fetch(ENDPOINTS[settings.fbr.environment], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.fbr.token}` },
      body: JSON.stringify(built.payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text);
    } catch {
      fail(`Unexpected response (${res.status}): ${text.slice(0, 200)}`);
      return;
    }
    const invoiceNumber = typeof data.InvoiceNumber === 'string' ? data.InvoiceNumber : '';
    if (res.ok && String(data.Code) === '100' && invoiceNumber) {
      run(
        db,
        `UPDATE sales SET fbr_status = 'synced', fbr_invoice_no = ?, fbr_error = NULL, fbr_attempts = fbr_attempts + 1,
           fbr_synced_at = ?, updated_at = ? WHERE id = ?`,
        [invoiceNumber, nowLocal(), nowLocal(), saleId],
      );
      return;
    }
    fail(String(data.Response ?? data.Errors ?? `HTTP ${res.status}`));
  } catch (err) {
    fail(controller.signal.aborted ? 'FBR server did not respond in time' : (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

export async function syncPendingFbr(ctx: AppContext, limit = 20): Promise<number> {
  const settings = getSettings(ctx.db);
  if (!settings.fbr.enabled) return 0;
  const pending = all<{ id: number }>(
    ctx.db,
    `SELECT id FROM sales WHERE status = 'completed' AND fbr_status IN ('pending','failed') AND fbr_attempts < ?
     ORDER BY id LIMIT ?`,
    [MAX_ATTEMPTS, limit],
  );
  for (const p of pending) await submitSaleToFbr(ctx, p.id);
  return pending.length;
}

export function startFbrWorker(ctx: AppContext): () => void {
  let running = false;
  const timer = setInterval(
    async () => {
      if (running) return;
      running = true;
      try {
        await syncPendingFbr(ctx);
      } catch (err) {
        ctx.logger.error({ err }, 'FBR background sync error');
      } finally {
        running = false;
      }
    },
    5 * 60 * 1000,
  );
  timer.unref();
  return () => clearInterval(timer);
}
