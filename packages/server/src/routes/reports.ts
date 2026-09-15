import { Router, type Request } from 'express';
import type { DashboardData } from '@pos/shared';
import type { AppContext } from '../context';
import { all, one, type DB } from '../db';
import { can, requirePermission } from '../middleware/auth';
import { badRequest } from '../lib/errors';
import { queryDay, queryInt, queryString } from '../lib/http';
import { addDays, monthStart, todayLocal } from '../lib/time';

function range(req: Request) {
  const today = todayLocal();
  const from = queryDay(req.query, 'from') ?? monthStart(today);
  const to = queryDay(req.query, 'to') ?? today;
  if (from > to) throw badRequest('From date must be before To date');
  return { from, to, toEx: addDays(to, 1) };
}

function salesTotals(db: DB, from: string, toEx: string) {
  return one<{ count: number; total: number; tax: number; cost: number; credit: number }>(
    db,
    `SELECT COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS total, COALESCE(SUM(tax_total), 0) AS tax,
       COALESCE(SUM(cost_total), 0) AS cost, COALESCE(SUM(balance_due), 0) AS credit
     FROM sales WHERE status = 'completed' AND sale_date >= @from AND sale_date < @toEx`,
    { from, toEx },
  )!;
}

function returnTotals(db: DB, from: string, toEx: string) {
  return one<{ total: number; tax: number; cost: number }>(
    db,
    `SELECT COALESCE(SUM(total_amount), 0) AS total, COALESCE(SUM(tax_total), 0) AS tax,
       COALESCE(SUM(cost_total), 0) AS cost
     FROM sale_returns WHERE return_date >= @from AND return_date < @toEx`,
    { from, toEx },
  )!;
}

function expenseTotal(db: DB, from: string, toEx: string): number {
  return one<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE is_void = 0 AND expense_date >= @from AND expense_date < @toEx`,
    { from, toEx },
  )!.total;
}

export function reportRoutes(ctx: AppContext) {
  const router = Router();
  const { db } = ctx;

  router.get('/dashboard', requirePermission('dashboard.view'), (req, res) => {
    const today = todayLocal();
    const tomorrow = addDays(today, 1);
    const showProfit = can(req, 'reports.profit');
    const t = salesTotals(db, today, tomorrow);
    const tr = returnTotals(db, today, tomorrow);
    const cashReceived = one<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
       WHERE is_void = 0 AND direction = 'in' AND method = 'cash' AND payment_date >= @today AND payment_date < @tomorrow`,
      { today, tomorrow },
    )!.total;
    const mStart = monthStart(today);
    const m = salesTotals(db, mStart, tomorrow);
    const mr = returnTotals(db, mStart, tomorrow);

    const receivables = one<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(balance), 0) AS total FROM (
         SELECT c.opening_balance + COALESCE((SELECT SUM(debit - credit) FROM customer_ledger l WHERE l.customer_id = c.id), 0) AS balance
         FROM customers c) WHERE balance > 0`,
    )!.total;
    const payables = one<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(balance), 0) AS total FROM (
         SELECT s.opening_balance + COALESCE((SELECT SUM(credit - debit) FROM supplier_ledger l WHERE l.supplier_id = s.id), 0) AS balance
         FROM suppliers s) WHERE balance > 0`,
    )!.total;

    const stockValues = one<{ cost: number; sale: number }>(
      db,
      `SELECT COALESCE(SUM(ROUND(MAX(stock_qty, 0) * cost_price)), 0) AS cost,
         COALESCE(SUM(ROUND(MAX(stock_qty, 0) * sale_price)), 0) AS sale
       FROM products WHERE is_active = 1 AND track_stock = 1`,
    )!;

    const trendFrom = addDays(today, -13);
    const trendRows = all<{ day: string; total: number; count: number }>(
      db,
      `SELECT substr(sale_date, 1, 10) AS day, SUM(grand_total) AS total, COUNT(*) AS count FROM sales
       WHERE status = 'completed' AND sale_date >= @from AND sale_date < @to GROUP BY day`,
      { from: trendFrom, to: tomorrow },
    );
    const trendMap = new Map(trendRows.map((r) => [r.day, r]));
    const salesTrend = Array.from({ length: 14 }, (_, i) => {
      const day = addDays(trendFrom, i);
      const r = trendMap.get(day);
      return { date: day, total: r?.total ?? 0, count: r?.count ?? 0 };
    });

    const data: DashboardData = {
      today: {
        salesCount: t.count,
        salesTotal: t.total,
        cashReceived,
        creditSales: t.credit,
        returnsTotal: tr.total,
        expensesTotal: expenseTotal(db, today, tomorrow),
        grossProfit: showProfit ? t.total - t.tax - t.cost - (tr.total - tr.tax - tr.cost) : null,
      },
      month: {
        salesTotal: m.total - mr.total,
        grossProfit: showProfit ? m.total - m.tax - m.cost - (mr.total - mr.tax - mr.cost) : null,
        expensesTotal: expenseTotal(db, mStart, tomorrow),
      },
      receivables,
      payables,
      lowStockCount: one<{ n: number }>(
        db,
        'SELECT COUNT(*) AS n FROM products WHERE is_active = 1 AND track_stock = 1 AND stock_qty <= min_stock',
      )!.n,
      pendingDeliveries: one<{ n: number }>(
        db,
        "SELECT COUNT(*) AS n FROM sales WHERE status = 'completed' AND delivery_status IN ('pending','dispatched')",
      )!.n,
      fbrPending: one<{ n: number }>(
        db,
        "SELECT COUNT(*) AS n FROM sales WHERE status = 'completed' AND fbr_status IN ('pending','failed')",
      )!.n,
      agreementsDue: one<{ n: number }>(
        db,
        "SELECT COUNT(*) AS n FROM credit_agreements WHERE status = 'active' AND due_date <= ?",
        [addDays(today, 7)],
      )!.n,
      stockCostValue: showProfit ? stockValues.cost : null,
      stockSaleValue: stockValues.sale,
      salesTrend,
      topProducts: all(
        db,
        `SELECT i.product_id AS productId, i.product_name AS productName, SUM(i.base_qty) AS qty, u.symbol AS unitSymbol,
           SUM(i.line_total) AS total
         FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN products p ON p.id = i.product_id
         JOIN units u ON u.id = p.unit_id
         WHERE s.status = 'completed' AND s.sale_date >= @from AND s.sale_date < @to
         GROUP BY i.product_id ORDER BY total DESC LIMIT 6`,
        { from: mStart, to: tomorrow },
      ),
      lowStock: all(
        db,
        `SELECT p.id, p.name, p.stock_qty AS stockQty, p.min_stock AS minStock, u.symbol AS unitSymbol
         FROM products p JOIN units u ON u.id = p.unit_id
         WHERE p.is_active = 1 AND p.track_stock = 1 AND p.stock_qty <= p.min_stock
         ORDER BY (p.stock_qty - p.min_stock) ASC LIMIT 8`,
      ),
      recentSales: all(
        db,
        `SELECT id, invoice_no AS invoiceNo, sale_date AS saleDate, customer_name AS customerName,
           grand_total AS grandTotal, status FROM sales ORDER BY id DESC LIMIT 8`,
      ),
    };
    res.json(data);
  });

  router.get('/sales-summary', requirePermission('reports.view'), (req, res) => {
    const { from, to, toEx } = range(req);
    const groupBy = queryString(req.query, 'groupBy') === 'month' ? 7 : 10;
    const showProfit = can(req, 'reports.profit');
    const sales = all<{
      period: string;
      invoices: number;
      subtotal: number;
      discount: number;
      tax: number;
      delivery: number;
      labour: number;
      total: number;
      paid: number;
      credit: number;
      cost: number;
    }>(
      db,
      `SELECT substr(sale_date, 1, ${groupBy}) AS period, COUNT(*) AS invoices, SUM(subtotal) AS subtotal,
         SUM(item_discount + bill_discount) AS discount, SUM(tax_total) AS tax, SUM(delivery_charges) AS delivery,
         SUM(labour_charges) AS labour, SUM(grand_total) AS total, SUM(paid_amount) AS paid,
         SUM(balance_due) AS credit, SUM(cost_total) AS cost
       FROM sales WHERE status = 'completed' AND sale_date >= @from AND sale_date < @toEx
       GROUP BY period ORDER BY period`,
      { from, toEx },
    );
    const returns = all<{ period: string; total: number; tax: number; cost: number }>(
      db,
      `SELECT substr(return_date, 1, ${groupBy}) AS period, SUM(total_amount) AS total, SUM(tax_total) AS tax,
         SUM(cost_total) AS cost
       FROM sale_returns WHERE return_date >= @from AND return_date < @toEx GROUP BY period`,
      { from, toEx },
    );
    const retMap = new Map(returns.map((r) => [r.period, r]));
    const periods = [...new Set([...sales.map((s) => s.period), ...returns.map((r) => r.period)])].sort();
    const salesMap = new Map(sales.map((s) => [s.period, s]));
    const rows = periods.map((period) => {
      const s = salesMap.get(period);
      const r = retMap.get(period);
      const netSales = (s?.total ?? 0) - (r?.total ?? 0);
      const profit = (s?.total ?? 0) - (s?.tax ?? 0) - (s?.cost ?? 0) - ((r?.total ?? 0) - (r?.tax ?? 0) - (r?.cost ?? 0));
      return {
        period,
        invoices: s?.invoices ?? 0,
        subtotal: s?.subtotal ?? 0,
        discount: s?.discount ?? 0,
        tax: (s?.tax ?? 0) - (r?.tax ?? 0),
        delivery: s?.delivery ?? 0,
        labour: s?.labour ?? 0,
        total: s?.total ?? 0,
        returns: r?.total ?? 0,
        netSales,
        paid: s?.paid ?? 0,
        credit: s?.credit ?? 0,
        profit: showProfit ? profit : null,
      };
    });
    res.json({ from, to, rows });
  });

  router.get('/sales-by-product', requirePermission('reports.view'), (req, res) => {
    const { from, to, toEx } = range(req);
    const categoryId = queryInt(req.query, 'categoryId') ?? null;
    const showProfit = can(req, 'reports.profit');
    const rows = all<{
      productId: number;
      productName: string;
      sku: string;
      categoryName: string;
      unitSymbol: string;
      qty: number;
      total: number;
      cost: number;
      returnedQty: number;
      returnedTotal: number;
      returnedCost: number;
    }>(
      db,
      `WITH sold AS (
         SELECT i.product_id, SUM(i.base_qty) AS qty, SUM(i.line_total - i.tax_amount) AS total,
           SUM(ROUND(i.base_qty * i.cost_price)) AS cost
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
         WHERE s.status = 'completed' AND s.sale_date >= @from AND s.sale_date < @toEx
         GROUP BY i.product_id
       ), returned AS (
         SELECT ri.product_id, SUM(ri.base_qty) AS qty, SUM(ri.amount - ri.tax_amount) AS total,
           SUM(CASE WHEN ri.restock = 1 THEN ROUND(ri.base_qty * ri.cost_price) ELSE 0 END) AS cost
         FROM sale_return_items ri JOIN sale_returns r ON r.id = ri.sale_return_id
         WHERE r.return_date >= @from AND r.return_date < @toEx
         GROUP BY ri.product_id
       )
       SELECT p.id AS productId, p.name AS productName, p.sku, c.name AS categoryName, u.symbol AS unitSymbol,
         COALESCE(sold.qty, 0) AS qty, COALESCE(sold.total, 0) AS total, COALESCE(sold.cost, 0) AS cost,
         COALESCE(returned.qty, 0) AS returnedQty, COALESCE(returned.total, 0) AS returnedTotal,
         COALESCE(returned.cost, 0) AS returnedCost
       FROM products p
       JOIN categories c ON c.id = p.category_id JOIN units u ON u.id = p.unit_id
       LEFT JOIN sold ON sold.product_id = p.id LEFT JOIN returned ON returned.product_id = p.id
       WHERE (sold.product_id IS NOT NULL OR returned.product_id IS NOT NULL)
         AND (@categoryId IS NULL OR p.category_id = @categoryId)
       ORDER BY total DESC`,
      { from, toEx, categoryId },
    );
    res.json({
      from,
      to,
      rows: rows.map((r) => ({
        productId: r.productId,
        productName: r.productName,
        sku: r.sku,
        categoryName: r.categoryName,
        unitSymbol: r.unitSymbol,
        qty: r.qty - r.returnedQty,
        netSales: r.total - r.returnedTotal,
        profit: showProfit ? r.total - r.returnedTotal - (r.cost - r.returnedCost) : null,
      })),
    });
  });

  router.get('/sales-by-category', requirePermission('reports.view'), (req, res) => {
    const { from, to, toEx } = range(req);
    const showProfit = can(req, 'reports.profit');
    const rows = all<{ categoryId: number; categoryName: string; total: number; cost: number; invoices: number }>(
      db,
      `SELECT c.id AS categoryId, c.name AS categoryName, SUM(i.line_total - i.tax_amount) AS total,
         SUM(ROUND(i.base_qty * i.cost_price)) AS cost, COUNT(DISTINCT s.id) AS invoices
       FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN products p ON p.id = i.product_id
       JOIN categories c ON c.id = p.category_id
       WHERE s.status = 'completed' AND s.sale_date >= @from AND s.sale_date < @toEx
       GROUP BY c.id ORDER BY total DESC`,
      { from, toEx },
    );
    res.json({
      from,
      to,
      rows: rows.map((r) => ({ ...r, cost: undefined, profit: showProfit ? r.total - r.cost : null })),
    });
  });

  router.get('/sales-by-customer', requirePermission('reports.view'), (req, res) => {
    const { from, to, toEx } = range(req);
    const rows = all(
      db,
      `SELECT s.customer_id AS customerId, COALESCE(c.name, 'Walk-in Customers') AS customerName,
         COUNT(*) AS invoices, SUM(s.grand_total) AS total, SUM(s.paid_amount) AS paid, SUM(s.balance_due) AS credit
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.status = 'completed' AND s.sale_date >= @from AND s.sale_date < @toEx
       GROUP BY s.customer_id ORDER BY total DESC`,
      { from, toEx },
    );
    res.json({ from, to, rows });
  });

  router.get('/sales-by-user', requirePermission('reports.view'), (req, res) => {
    const { from, to, toEx } = range(req);
    const rows = all(
      db,
      `SELECT u.id AS userId, u.full_name AS userName, COUNT(*) AS invoices, SUM(s.grand_total) AS total,
         SUM(s.item_discount + s.bill_discount) AS discount
       FROM sales s JOIN users u ON u.id = s.created_by
       WHERE s.status = 'completed' AND s.sale_date >= @from AND s.sale_date < @toEx
       GROUP BY u.id ORDER BY total DESC`,
      { from, toEx },
    );
    res.json({ from, to, rows });
  });

  router.get('/payments-by-method', requirePermission('reports.view'), (req, res) => {
    const { from, to, toEx } = range(req);
    const rows = all(
      db,
      `SELECT method, SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END) AS received,
         SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) AS paid, COUNT(*) AS count
       FROM payments WHERE is_void = 0 AND payment_date >= @from AND payment_date < @toEx
       GROUP BY method ORDER BY received DESC`,
      { from, toEx },
    );
    res.json({ from, to, rows });
  });

  router.get('/profit-loss', requirePermission('reports.profit'), (req, res) => {
    const { from, to, toEx } = range(req);
    const s = salesTotals(db, from, toEx);
    const r = returnTotals(db, from, toEx);
    const charges = one<{ delivery: number; labour: number; discount: number }>(
      db,
      `SELECT COALESCE(SUM(delivery_charges), 0) AS delivery, COALESCE(SUM(labour_charges), 0) AS labour,
         COALESCE(SUM(item_discount + bill_discount), 0) AS discount
       FROM sales WHERE status = 'completed' AND sale_date >= @from AND sale_date < @toEx`,
      { from, toEx },
    )!;
    const expenses = all<{ category: string; amount: number }>(
      db,
      `SELECT c.name AS category, SUM(e.amount) AS amount FROM expenses e JOIN expense_categories c ON c.id = e.category_id
       WHERE e.is_void = 0 AND e.expense_date >= @from AND e.expense_date < @toEx GROUP BY c.id ORDER BY amount DESC`,
      { from, toEx },
    );
    const salesExTax = s.total - s.tax;
    const returnsExTax = r.total - r.tax;
    const netSales = salesExTax - returnsExTax;
    const cogs = s.cost - r.cost;
    const gross = netSales - cogs;
    const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);
    res.json({
      from,
      to,
      invoices: s.count,
      grossSales: salesExTax,
      returns: returnsExTax,
      netSales,
      discountsGiven: charges.discount,
      deliveryIncome: charges.delivery,
      labourIncome: charges.labour,
      taxCollected: s.tax - r.tax,
      cogs,
      grossProfit: gross,
      grossMargin: netSales > 0 ? Math.round((gross / netSales) * 10000) / 100 : 0,
      expenses,
      totalExpenses,
      netProfit: gross - totalExpenses,
    });
  });

  router.get('/inventory-valuation', requirePermission('reports.view'), (req, res) => {
    const categoryId = queryInt(req.query, 'categoryId') ?? null;
    const showCost = can(req, 'products.view_cost');
    const rows = all<{
      productId: number;
      sku: string;
      productName: string;
      categoryName: string;
      brandName: string | null;
      unitSymbol: string;
      qty: number;
      costPrice: number;
      salePrice: number;
    }>(
      db,
      `SELECT p.id AS productId, p.sku, p.name AS productName, c.name AS categoryName, b.name AS brandName,
         u.symbol AS unitSymbol, p.stock_qty AS qty, p.cost_price AS costPrice, p.sale_price AS salePrice
       FROM products p JOIN categories c ON c.id = p.category_id JOIN units u ON u.id = p.unit_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.is_active = 1 AND p.track_stock = 1 AND (@categoryId IS NULL OR p.category_id = @categoryId)
       ORDER BY c.sort_order, p.name`,
      { categoryId },
    );
    const mapped = rows.map((r) => ({
      ...r,
      costPrice: showCost ? r.costPrice : null,
      costValue: showCost ? Math.round(Math.max(0, r.qty) * r.costPrice) : null,
      saleValue: Math.round(Math.max(0, r.qty) * r.salePrice),
    }));
    res.json({
      rows: mapped,
      totalCostValue: showCost ? mapped.reduce((a, r) => a + (r.costValue ?? 0), 0) : null,
      totalSaleValue: mapped.reduce((a, r) => a + r.saleValue, 0),
    });
  });

  router.get('/low-stock', requirePermission('reports.view', 'products.manage'), (_req, res) => {
    res.json({
      rows: all(
        db,
        `SELECT p.id AS productId, p.sku, p.name AS productName, c.name AS categoryName, u.symbol AS unitSymbol,
           p.stock_qty AS qty, p.min_stock AS minStock, s.name AS supplierName, s.phone AS supplierPhone
         FROM products p JOIN categories c ON c.id = p.category_id JOIN units u ON u.id = p.unit_id
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.is_active = 1 AND p.track_stock = 1 AND p.stock_qty <= p.min_stock
         ORDER BY (p.stock_qty - p.min_stock) ASC`,
      ),
    });
  });

  router.get('/receivables', requirePermission('reports.view', 'customers.view'), (_req, res) => {
    const rows = all<{ balance: number }>(
      db,
      `SELECT * FROM (
         SELECT c.id AS customerId, c.name AS customerName, c.phone, c.customer_type AS customerType,
           c.credit_limit AS creditLimit,
           c.opening_balance + COALESCE((SELECT SUM(debit - credit) FROM customer_ledger l WHERE l.customer_id = c.id), 0) AS balance,
           (SELECT MAX(sale_date) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') AS lastSaleDate,
           (SELECT MAX(payment_date) FROM payments p WHERE p.customer_id = c.id AND p.direction = 'in' AND p.is_void = 0) AS lastPaymentDate,
           (SELECT MIN(due_date) FROM credit_agreements a WHERE a.customer_id = c.id AND a.status = 'active') AS dueDate
         FROM customers c) WHERE balance > 0 ORDER BY balance DESC`,
    );
    const today = todayLocal();
    const withStatus = rows.map((r) => {
      const due = (r as { dueDate?: string | null }).dueDate ?? null;
      return { ...r, overdue: !!due && due < today };
    });
    res.json({
      rows: withStatus,
      total: rows.reduce((a, r) => a + r.balance, 0),
      overdueTotal: withStatus.filter((r) => r.overdue).reduce((a, r) => a + r.balance, 0),
    });
  });

  router.get('/stock-analysis', requirePermission('reports.profit'), (req, res) => {
    const { from, to, toEx } = range(req);
    const categoryId = queryInt(req.query, 'categoryId') ?? null;
    const rows = all<{
      productId: number;
      sku: string;
      productName: string;
      categoryName: string;
      unitSymbol: string;
      qty: number;
      costPrice: number;
      salePrice: number;
      purchasedQty: number;
      purchasedValue: number;
      soldQty: number;
      soldValue: number;
      soldCost: number;
    }>(
      db,
      `WITH bought AS (
         SELECT i.product_id, SUM(i.base_qty) AS qty, SUM(i.line_total) AS value
         FROM purchase_items i JOIN purchases p ON p.id = i.purchase_id
         WHERE p.status = 'completed' AND p.purchase_date >= @from AND p.purchase_date < @toEx
         GROUP BY i.product_id
       ), bought_back AS (
         SELECT ri.product_id, SUM(ri.base_qty) AS qty, SUM(ri.amount) AS value
         FROM purchase_return_items ri JOIN purchase_returns r ON r.id = ri.purchase_return_id
         WHERE r.return_date >= @from AND r.return_date < @toEx GROUP BY ri.product_id
       ), sold AS (
         SELECT i.product_id, SUM(i.base_qty) AS qty, SUM(i.line_total - i.tax_amount) AS value,
           SUM(ROUND(i.base_qty * i.cost_price)) AS cost
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
         WHERE s.status = 'completed' AND s.sale_date >= @from AND s.sale_date < @toEx GROUP BY i.product_id
       ), sold_back AS (
         SELECT ri.product_id, SUM(ri.base_qty) AS qty, SUM(ri.amount - ri.tax_amount) AS value,
           SUM(CASE WHEN ri.restock = 1 THEN ROUND(ri.base_qty * ri.cost_price) ELSE 0 END) AS cost
         FROM sale_return_items ri JOIN sale_returns r ON r.id = ri.sale_return_id
         WHERE r.return_date >= @from AND r.return_date < @toEx GROUP BY ri.product_id
       )
       SELECT p.id AS productId, p.sku, p.name AS productName, c.name AS categoryName, u.symbol AS unitSymbol,
         p.stock_qty AS qty, p.cost_price AS costPrice, p.sale_price AS salePrice,
         COALESCE(b.qty, 0) - COALESCE(bb.qty, 0) AS purchasedQty, COALESCE(b.value, 0) - COALESCE(bb.value, 0) AS purchasedValue,
         COALESCE(s.qty, 0) - COALESCE(sb.qty, 0) AS soldQty, COALESCE(s.value, 0) - COALESCE(sb.value, 0) AS soldValue,
         COALESCE(s.cost, 0) - COALESCE(sb.cost, 0) AS soldCost
       FROM products p JOIN categories c ON c.id = p.category_id JOIN units u ON u.id = p.unit_id
       LEFT JOIN bought b ON b.product_id = p.id LEFT JOIN bought_back bb ON bb.product_id = p.id
       LEFT JOIN sold s ON s.product_id = p.id LEFT JOIN sold_back sb ON sb.product_id = p.id
       WHERE p.is_active = 1 AND (@categoryId IS NULL OR p.category_id = @categoryId)
       ORDER BY c.sort_order, p.name`,
      { from, toEx, categoryId },
    );
    const mapped = rows.map((r) => {
      const stockQty = Math.max(0, r.qty);
      const costValue = Math.round(stockQty * r.costPrice);
      const saleValue = Math.round(stockQty * r.salePrice);
      return {
        ...r,
        costValue,
        saleValue,
        potentialProfit: saleValue - costValue,
        realizedProfit: r.soldValue - r.soldCost,
      };
    });
    const sum = (k: keyof (typeof mapped)[number]) => mapped.reduce((a, r) => a + (r[k] as number), 0);
    const receivables = one<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(balance), 0) AS total FROM (
         SELECT c.opening_balance + COALESCE((SELECT SUM(debit - credit) FROM customer_ledger l WHERE l.customer_id = c.id), 0) AS balance
         FROM customers c) WHERE balance > 0`,
    )!.total;
    const expenses = one<{ total: number }>(
      db,
      'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE is_void = 0 AND expense_date >= @from AND expense_date < @toEx',
      { from, toEx },
    )!.total;
    res.json({
      from,
      to,
      rows: mapped,
      totals: {
        stockCostValue: sum('costValue'),
        stockSaleValue: sum('saleValue'),
        potentialProfit: sum('potentialProfit'),
        purchasedValue: sum('purchasedValue'),
        soldValue: sum('soldValue'),
        soldCost: sum('soldCost'),
        realizedProfit: sum('realizedProfit'),
        expenses,
        netProfit: sum('realizedProfit') - expenses,
        receivables,
      },
    });
  });

  router.get('/payables', requirePermission('reports.view', 'suppliers.view'), (_req, res) => {
    const rows = all<{ balance: number }>(
      db,
      `SELECT * FROM (
         SELECT s.id AS supplierId, s.name AS supplierName, s.company, s.phone,
           s.opening_balance + COALESCE((SELECT SUM(credit - debit) FROM supplier_ledger l WHERE l.supplier_id = s.id), 0) AS balance,
           (SELECT MAX(purchase_date) FROM purchases p WHERE p.supplier_id = s.id AND p.status = 'completed') AS lastPurchaseDate,
           (SELECT MAX(payment_date) FROM payments p WHERE p.supplier_id = s.id AND p.direction = 'out' AND p.is_void = 0) AS lastPaymentDate
         FROM suppliers s) WHERE balance > 0 ORDER BY balance DESC`,
    );
    res.json({ rows, total: rows.reduce((a, r) => a + r.balance, 0) });
  });

  router.get('/tax', requirePermission('reports.view'), (req, res) => {
    const { from, to, toEx } = range(req);
    const byRate = all<{ rate: number; taxableValue: number; tax: number }>(
      db,
      `SELECT i.tax_rate AS rate, SUM(i.taxable_value) AS taxableValue, SUM(i.tax_amount) AS tax
       FROM sale_items i JOIN sales s ON s.id = i.sale_id
       WHERE s.status = 'completed' AND s.sale_date >= @from AND s.sale_date < @toEx
       GROUP BY i.tax_rate ORDER BY i.tax_rate DESC`,
      { from, toEx },
    );
    const returnsTax = one<{ tax: number; total: number }>(
      db,
      `SELECT COALESCE(SUM(tax_total), 0) AS tax, COALESCE(SUM(total_amount), 0) AS total FROM sale_returns
       WHERE return_date >= @from AND return_date < @toEx`,
      { from, toEx },
    )!;
    const invoices = all(
      db,
      `SELECT s.id, s.invoice_no AS invoiceNo, s.sale_date AS saleDate, COALESCE(c.name, s.customer_name) AS customerName,
         c.ntn AS customerNtn, c.cnic AS customerCnic, s.taxable_value AS taxableValue, s.tax_total AS taxTotal,
         s.grand_total AS grandTotal, s.fbr_invoice_no AS fbrInvoiceNo
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.status = 'completed' AND s.sale_date >= @from AND s.sale_date < @toEx AND s.tax_total > 0
       ORDER BY s.sale_date`,
      { from, toEx },
    );
    const outputTax = byRate.reduce((a, r) => a + r.tax, 0);
    res.json({
      from,
      to,
      byRate,
      outputTax,
      returnsTax: returnsTax.tax,
      netOutputTax: outputTax - returnsTax.tax,
      inputTax: one<{ tax: number }>(
        db,
        `SELECT COALESCE(SUM(tax_amount), 0) AS tax FROM purchases
         WHERE status = 'completed' AND purchase_date >= @from AND purchase_date < @toEx`,
        { from, toEx },
      )!.tax,
      invoices,
    });
  });

  return router;
}
