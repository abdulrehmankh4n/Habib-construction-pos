import { z } from 'zod';
import type { AppSettings } from '@pos/shared';
import { one, run, type DB } from '../db';
import { nowLocal } from './time';

const str = (max: number, def = '') => z.string().trim().max(max).default(def);

export const DEFAULT_SALE_TEMPLATE = `Assalam-o-Alaikum {customerName},
Thank you for shopping at {shopName}.
Invoice: {invoiceNo}
Date: {date}
{items}
Bill Total: {total}
Paid: {paid}
Remaining on this bill: {balanceDue}
Your account balance: {currentBalance}
Contact: {shopPhone}`;

export const DEFAULT_PAYMENT_TEMPLATE = `Dear {customerName}, we have received {amount} ({method}) on {date}. Receipt No: {paymentNo}. Remaining balance: {currentBalance}. Thank you - {shopName} {shopPhone}`;

export const DEFAULT_REMINDER_TEMPLATE = `Dear {customerName}, this is a friendly reminder from {shopName} that your outstanding balance is {currentBalance}. {dueDateLine}Kindly arrange the payment at your earliest. Thank you. {shopPhone}`;

export const DEFAULT_AGREEMENT_EN = `This Agreement is made on {{date}} at {{shopCity}} between {{shopName}}, {{shopAddress}} (hereinafter called the "Seller") and {{customerName}} S/O, D/O, W/O {{fatherName}}, holding CNIC No. {{cnic}}, resident of {{address}}, Mobile No. {{phone}} (hereinafter called the "Buyer").

1. The Buyer has purchased construction materials from the Seller on credit and hereby acknowledges that an amount of {{amount}} ({{amountWords}}) is outstanding and payable by the Buyer to the Seller.

2. The Buyer undertakes to pay the full outstanding amount to the Seller on or before {{dueDate}}, i.e. within {{days}} days from the date of this Agreement{{installmentClause}}.

3. {{terms}}

4. If the Buyer fails to pay the outstanding amount within the agreed period, the Seller shall be entitled to initiate legal proceedings against the Buyer before a competent court of law for recovery of the outstanding amount together with all costs and expenses of recovery, and the Buyer shall be fully liable for the same.

5. The Buyer declares that he/she has signed this Agreement of his/her own free will, in a sound state of mind and without any pressure or coercion, in the presence of the witnesses named below, and that the information given above is true and correct.`;

export const DEFAULT_AGREEMENT_UR = `منکہ {{customerName}} ولد / زوجہ {{fatherName}}، شناختی کارڈ نمبر {{cnic}}، سکنہ {{address}}، موبائل نمبر {{phone}}، بقائمی ہوش و حواس بلا جبر و اکراہ اقرار کرتا / کرتی ہوں کہ:

1۔ میں نے {{shopName}}، {{shopAddress}} سے تعمیراتی سامان ادھار پر خریدا ہے، جس کی مد میں مبلغ {{amountNumber}} روپے میرے ذمہ واجب الادا ہیں۔

2۔ میں مذکورہ رقم مورخہ {{dueDate}} تک، یعنی {{days}} دن کے اندر، مکمل طور پر ادا کرنے کا پابند ہوں۔

3۔ {{terms}}

4۔ اگر میں مقررہ مدت کے اندر مذکورہ رقم ادا نہ کروں تو فروخت کنندہ کو مکمل اختیار ہوگا کہ وہ رقم کی وصولی کے لیے میرے خلاف مجاز عدالت میں قانونی کارروائی کرے، اور اس سلسلے میں ہونے والے تمام اخراجات کی ذمہ داری بھی مجھ پر ہوگی۔

5۔ یہ اقرار نامہ میں نے اپنی مرضی سے، بغیر کسی دباؤ کے، گواہان کی موجودگی میں تحریر کر دیا ہے تاکہ سند رہے اور بوقت ضرورت کام آئے۔`;

export const settingsSchema = z.object({
  shop: z
    .object({
      name: str(120, 'My Construction Store'),
      tagline: str(160, 'Building Materials & Hardware'),
      address: str(300),
      city: str(80),
      phone: str(40),
      phone2: str(40),
      email: str(120),
      ntn: str(40),
      strn: str(40),
    })
    .default({}),
  tax: z
    .object({
      enabled: z.boolean().default(true),
      pricesIncludeTax: z.boolean().default(true),
    })
    .default({}),
  sales: z
    .object({
      allowCredit: z.boolean().default(true),
      allowNegativeStock: z.boolean().default(false),
      roundingUnit: z.coerce.number().int().refine((v) => [1, 100, 500, 1000].includes(v)).default(100),
      walkInLabel: str(60, 'Walk-in Customer'),
    })
    .default({}),
  receipt: z
    .object({
      paper: z.enum(['thermal80', 'thermal58', 'a4']).default('thermal80'),
      autoPrint: z.boolean().default(false),
      showUrduNames: z.boolean().default(true),
      footer: str(300, 'Thank you for your business!'),
      urduFooter: str(300, 'خریداری کا شکریہ'),
      terms: str(1000, 'Goods once sold can be returned within 7 days in original condition with receipt.'),
    })
    .default({}),
  quotation: z
    .object({
      validityDays: z.coerce.number().int().min(1).max(365).default(7),
      terms: str(1000, 'Prices are subject to change without prior notice. Delivery charges extra where applicable.'),
    })
    .default({}),
  cash: z
    .object({
      openingBalance: z.coerce.number().int().min(0).default(0),
    })
    .default({}),
  fbr: z
    .object({
      enabled: z.boolean().default(false),
      environment: z.enum(['sandbox', 'production']).default('sandbox'),
      posId: str(40),
      token: str(2000),
      timeoutSeconds: z.coerce.number().int().min(2).max(60).default(10),
    })
    .default({}),
  backup: z
    .object({
      autoEnabled: z.boolean().default(true),
      retentionCount: z.coerce.number().int().min(1).max(365).default(30),
    })
    .default({}),
  notifications: z
    .object({
      whatsappEnabled: z.boolean().default(true),
      smsEnabled: z.boolean().default(false),
      autoSmsOnSale: z.boolean().default(false),
      autoSmsOnPayment: z.boolean().default(false),
      smsMethod: z.enum(['GET', 'POST']).default('GET'),
      smsUrl: str(1000),
      smsBody: str(2000),
      smsHeaders: str(2000),
      smsPhoneFormat: z.enum(['local', 'international']).default('international'),
      saleTemplate: str(1500, DEFAULT_SALE_TEMPLATE),
      paymentTemplate: str(1000, DEFAULT_PAYMENT_TEMPLATE),
      reminderTemplate: str(1000, DEFAULT_REMINDER_TEMPLATE),
    })
    .default({}),
  agreement: z
    .object({
      paperSize: z.enum(['legal', 'a4']).default('legal'),
      topMarginInches: z.coerce.number().min(0).max(10).default(4.5),
      language: z.enum(['english', 'urdu', 'bilingual']).default('english'),
      defaultDays: z.coerce.number().int().min(1).max(3650).default(90),
      englishTemplate: str(8000, DEFAULT_AGREEMENT_EN),
      urduTemplate: str(8000, DEFAULT_AGREEMENT_UR),
    })
    .default({}),
  zakat: z
    .object({
      rate: z.coerce.number().min(0).max(100).default(2.5),
      nisabValue: z.coerce.number().int().min(0).default(0),
      valuationBasis: z.enum(['retail', 'wholesale', 'cost']).default('wholesale'),
    })
    .default({}),
});

const cache = new WeakMap<DB, AppSettings>();

export function getSettings(db: DB): AppSettings {
  const cached = cache.get(db);
  if (cached) return cached;
  const row = one<{ value: string }>(db, "SELECT value FROM settings WHERE key = 'app'");
  let parsed: AppSettings;
  try {
    parsed = settingsSchema.parse(row ? JSON.parse(row.value) : {}) as AppSettings;
  } catch {
    parsed = settingsSchema.parse({}) as AppSettings;
  }
  cache.set(db, parsed);
  return parsed;
}

function deepMerge<T>(target: T, patch: unknown): T {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return (patch ?? target) as T;
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const current = out[k];
    out[k] =
      typeof v === 'object' && v !== null && !Array.isArray(v) && typeof current === 'object' && current !== null
        ? deepMerge(current, v)
        : v;
  }
  return out as T;
}

export function updateSettings(db: DB, patch: unknown): AppSettings {
  const merged = deepMerge(getSettings(db), patch);
  const parsed = settingsSchema.parse(merged) as AppSettings;
  run(
    db,
    `INSERT INTO settings (key, value, updated_at) VALUES ('app', @value, @now)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    { value: JSON.stringify(parsed), now: nowLocal() },
  );
  cache.set(db, parsed);
  return parsed;
}

export function publicSettings(settings: AppSettings, canManage: boolean): AppSettings {
  const masked: AppSettings = { ...settings, fbr: { ...settings.fbr, token: settings.fbr.token ? '••••••••' : '' } };
  if (!canManage) {
    masked.notifications = { ...settings.notifications, smsUrl: '', smsBody: '', smsHeaders: '' };
    masked.fbr = { ...masked.fbr, posId: '' };
  }
  return masked;
}
