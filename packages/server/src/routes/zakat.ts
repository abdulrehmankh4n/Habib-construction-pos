import { Router } from 'express';
import { z } from 'zod';
import type { Paginated, ZakatComputation, ZakatLine, ZakatReport } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, run, tx, type DB } from '../db';
import { actorOf, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { idParam, pagination, parse, zs } from '../lib/http';
import { getSettings } from '../lib/settings';
import { nowLocal, todayLocal } from '../lib/time';
import { computeCashBook } from './finance';

const computeSchema = z.object({
  valuationBasis: z.enum(['retail', 'wholesale', 'cost']).optional(),
  excludeCategoryIds: z.array(zs.id).max(100).default([]),
  includeCash: z.boolean().default(true),
  cashInHand: zs.optMoney,
  bankBalance: zs.money.default(0),
  includeReceivables: z.boolean().default(true),
  receivablesOverride: zs.optMoney,
  otherAssets: zs.money.default(0),
  deductPayables: z.boolean().default(true),
  otherLiabilities: zs.money.default(0),
  nisabValue: zs.optMoney,
  rate: z.coerce.number().min(0).max(100).optional(),
  notes: zs.text(1000),
});
type ComputeInput = z.infer<typeof computeSchema>;

export function computeZakat(db: DB, input: ComputeInput): ZakatComputation {
  const settings = getSettings(db).zakat;
  const basis = input.valuationBasis ?? settings.valuationBasis;
  const rateExpr = basis === 'cost' ? 'p.cost_price' : basis === 'wholesale' ? 'COALESCE(p.wholesale_price, p.sale_price)' : 'p.sale_price';
  const rows = all<Omit<ZakatLine, 'value'>>(
    db,
    `SELECT p.id AS productId, p.sku, p.name AS productName, c.id AS categoryId, c.name AS categoryName,
       u.symbol AS unitSymbol, p.stock_qty AS qty, ${rateExpr} AS rate
     FROM products p JOIN categories c ON c.id = p.category_id JOIN units u ON u.id = p.unit_id
     WHERE p.is_active = 1 AND p.track_stock = 1 AND p.stock_qty > 0
     ORDER BY c.sort_order, p.name`,
  );
  const excluded = new Set(input.excludeCategoryIds);
  const lines: ZakatLine[] = rows.map((r) => ({ ...r, value: Math.round(r.qty * r.rate) }));
  const catMap = new Map<number, { categoryId: number; categoryName: string; itemCount: number; value: number; included: boolean }>();
  for (const l of lines) {
    const c = catMap.get(l.categoryId) ?? {
      categoryId: l.categoryId,
      categoryName: l.categoryName,
      itemCount: 0,
      value: 0,
      included: !excluded.has(l.categoryId),
    };
    c.itemCount += 1;
    c.value += l.value;
    catMap.set(l.categoryId, c);
  }
  const includedLines = lines.filter((l) => !excluded.has(l.categoryId));
  const stockValue = includedLines.reduce((a, l) => a + l.value, 0);

  const today = todayLocal();
  const cashValue = input.includeCash
    ? (input.cashInHand ?? Math.max(0, computeCashBook(db, today).expectedCash)) + input.bankBalance
    : 0;
  const receivablesValue = input.includeReceivables
    ? (input.receivablesOverride ??
      one<{ total: number }>(
        db,
        `SELECT COALESCE(SUM(balance), 0) AS total FROM (
           SELECT c.opening_balance + COALESCE((SELECT SUM(debit - credit) FROM customer_ledger l WHERE l.customer_id = c.id), 0) AS balance
           FROM customers c) WHERE balance > 0`,
      )!.total)
    : 0;
  const payables = input.deductPayables
    ? one<{ total: number }>(
        db,
        `SELECT COALESCE(SUM(balance), 0) AS total FROM (
           SELECT s.opening_balance + COALESCE((SELECT SUM(credit - debit) FROM supplier_ledger l WHERE l.supplier_id = s.id), 0) AS balance
           FROM suppliers s) WHERE balance > 0`,
      )!.total
    : 0;
  const liabilities = payables + input.otherLiabilities;
  const netZakatable = Math.max(0, stockValue + cashValue + receivablesValue + input.otherAssets - liabilities);
  const nisabValue = input.nisabValue ?? settings.nisabValue;
  const rate = input.rate ?? settings.rate;
  const meetsNisab = netZakatable > 0 && netZakatable >= nisabValue;

  return {
    reportDate: nowLocal(),
    valuationBasis: basis,
    lines: includedLines,
    categories: [...catMap.values()],
    stockValue,
    cashValue,
    receivablesValue,
    otherAssets: input.otherAssets,
    liabilities,
    netZakatable,
    nisabValue,
    meetsNisab,
    rate,
    zakatPayable: meetsNisab ? Math.round((netZakatable * rate) / 100) : 0,
  };
}

const REPORT_SELECT = `SELECT z.id, z.report_date AS reportDate, z.valuation_basis AS valuationBasis,
  z.stock_value AS stockValue, z.cash_value AS cashValue, z.receivables_value AS receivablesValue,
  z.other_assets AS otherAssets, z.liabilities, z.net_zakatable AS netZakatable, z.nisab_value AS nisabValue,
  z.rate, z.zakat_payable AS zakatPayable, z.notes, u.full_name AS createdByName, z.created_at AS createdAt
FROM zakat_reports z LEFT JOIN users u ON u.id = z.created_by`;

export function zakatRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;
  router.use(requirePermission('zakat.view'));

  router.post('/compute', (req, res) => {
    res.json(computeZakat(db, parse(computeSchema, req.body)));
  });

  router.get('/reports', (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const total = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM zakat_reports')!.n;
    const data = all<ZakatReport>(db, `${REPORT_SELECT} ORDER BY z.id DESC LIMIT @limit OFFSET @offset`, {
      limit: pageSize,
      offset,
    });
    res.json({ data, total, page, pageSize } satisfies Paginated<ZakatReport>);
  });

  router.get('/reports/:id', (req, res) => {
    const id = idParam(req);
    const row = one<ZakatReport & { snapshot: string }>(db, `${REPORT_SELECT.replace('z.notes,', 'z.notes, z.snapshot,')} WHERE z.id = ?`, [id]);
    if (!row) throw notFound('Zakat report');
    res.json({ ...row, snapshot: JSON.parse(row.snapshot) });
  });

  router.post('/reports', (req, res) => {
    const input = parse(computeSchema, req.body);
    const actor = actorOf(req);
    const id = tx(db, () => {
      const result = computeZakat(db, input);
      const r = run(
        db,
        `INSERT INTO zakat_reports (report_date, valuation_basis, stock_value, cash_value, receivables_value, other_assets,
           liabilities, net_zakatable, nisab_value, rate, zakat_payable, snapshot, notes, created_by, created_at)
         VALUES (@reportDate, @valuationBasis, @stockValue, @cashValue, @receivablesValue, @otherAssets, @liabilities,
           @netZakatable, @nisabValue, @rate, @zakatPayable, @snapshot, @notes, @userId, @now)`,
        { ...result, snapshot: JSON.stringify(result), notes: input.notes, userId: actor.id, now: nowLocal() },
      );
      audit(db, actor, 'zakat.report', 'zakat_report', r.lastInsertRowid, { zakatPayable: result.zakatPayable });
      return Number(r.lastInsertRowid);
    });
    const row = one<ZakatReport & { snapshot: string }>(db, `${REPORT_SELECT.replace('z.notes,', 'z.notes, z.snapshot,')} WHERE z.id = ?`, [id])!;
    res.status(201).json({ ...row, snapshot: JSON.parse(row.snapshot) });
  });

  return router;
}
