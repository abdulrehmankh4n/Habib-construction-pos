import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { csvMoney, dateLabel, downloadCsv, money, monthStart, percent, qty, today } from '../../lib/format';
import { Button, Card, DateRange, EmptyState, PageHeader, Select, Spinner, StatCard, Tabs, TableWrap } from '../../components/ui';

type ReportTab =
  | 'summary'
  | 'products'
  | 'categories'
  | 'customers'
  | 'staff'
  | 'methods'
  | 'profit'
  | 'stock-analysis'
  | 'valuation'
  | 'receivables'
  | 'payables'
  | 'tax';

interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  csv: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right';
}

function ReportTable<T>({
  rows,
  columns,
  filename,
  footer,
  empty = 'No data for this period',
}: {
  rows: T[];
  columns: Column<T>[];
  filename: string;
  footer?: ReactNode;
  empty?: string;
}) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <>
      <div className="flex justify-end gap-2 px-4 py-2">
        <Button
          size="sm"
          icon={<Download className="h-4 w-4" />}
          onClick={() => downloadCsv(filename, [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => c.csv(r)))])}
        >
          CSV
        </Button>
        <Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
          Print
        </Button>
      </div>
      <TableWrap>
        <table className="table-base">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.align === 'right' ? 'num' : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === 'right' ? 'num' : undefined}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer}
        </table>
      </TableWrap>
    </>
  );
}

function useReport<T>(name: string, params: Record<string, string | number | undefined>, enabled = true) {
  return useQuery({
    queryKey: ['reports', name, params],
    queryFn: () => api.get<T>(`/reports/${name}`, params),
    enabled,
    placeholderData: (prev) => prev,
  });
}

interface SummaryRow {
  period: string;
  invoices: number;
  subtotal: number;
  discount: number;
  tax: number;
  delivery: number;
  labour: number;
  total: number;
  returns: number;
  netSales: number;
  paid: number;
  credit: number;
  profit: number | null;
}

function SummaryReport({ from, to }: { from: string; to: string }) {
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day');
  const { data, isLoading } = useReport<{ rows: SummaryRow[] }>('sales-summary', { from, to, groupBy });
  if (isLoading) return <Spinner />;
  const rows = data?.rows ?? [];
  const sum = (k: keyof SummaryRow) => rows.reduce((s, r) => s + ((r[k] as number) ?? 0), 0);
  return (
    <Card
      bodyClassName="p-0"
      actions={
        <Select className="w-36" value={groupBy} onChange={(e) => setGroupBy(e.target.value as 'day' | 'month')} aria-label="Group by">
          <option value="day">By day</option>
          <option value="month">By month</option>
        </Select>
      }
    >
      <ReportTable
        rows={rows}
        filename={`sales-summary-${from}-to-${to}.csv`}
        columns={[
          { key: 'period', label: 'Period', render: (r) => (groupBy === 'day' ? dateLabel(r.period) : r.period), csv: (r) => r.period },
          { key: 'invoices', label: 'Invoices', render: (r) => r.invoices, csv: (r) => r.invoices, align: 'right' },
          { key: 'total', label: 'Sales', render: (r) => money(r.total), csv: (r) => csvMoney(r.total), align: 'right' },
          { key: 'discount', label: 'Discount', render: (r) => money(r.discount), csv: (r) => csvMoney(r.discount), align: 'right' },
          { key: 'tax', label: 'GST', render: (r) => money(r.tax), csv: (r) => csvMoney(r.tax), align: 'right' },
          { key: 'returns', label: 'Returns', render: (r) => money(r.returns), csv: (r) => csvMoney(r.returns), align: 'right' },
          { key: 'netSales', label: 'Net sales', render: (r) => <span className="font-medium">{money(r.netSales)}</span>, csv: (r) => csvMoney(r.netSales), align: 'right' },
          { key: 'paid', label: 'Received', render: (r) => money(r.paid), csv: (r) => csvMoney(r.paid), align: 'right' },
          { key: 'credit', label: 'On credit', render: (r) => money(r.credit), csv: (r) => csvMoney(r.credit), align: 'right' },
          ...(rows[0]?.profit !== null && rows.length
            ? [{ key: 'profit', label: 'Gross profit', render: (r: SummaryRow) => money(r.profit), csv: (r: SummaryRow) => csvMoney(r.profit), align: 'right' as const }]
            : []),
        ]}
        footer={
          rows.length ? (
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td>Total</td>
                <td className="num">{sum('invoices')}</td>
                <td className="num">{money(sum('total'))}</td>
                <td className="num">{money(sum('discount'))}</td>
                <td className="num">{money(sum('tax'))}</td>
                <td className="num">{money(sum('returns'))}</td>
                <td className="num">{money(sum('netSales'))}</td>
                <td className="num">{money(sum('paid'))}</td>
                <td className="num">{money(sum('credit'))}</td>
                {rows[0]?.profit !== null && <td className="num">{money(sum('profit'))}</td>}
              </tr>
            </tfoot>
          ) : null
        }
      />
    </Card>
  );
}

function ProductsReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useReport<{ rows: { productId: number; productName: string; sku: string; categoryName: string; unitSymbol: string; qty: number; netSales: number; profit: number | null }[] }>('sales-by-product', { from, to });
  if (isLoading) return <Spinner />;
  const rows = data?.rows ?? [];
  return (
    <Card bodyClassName="p-0">
      <ReportTable
        rows={rows}
        filename={`sales-by-product-${from}-to-${to}.csv`}
        columns={[
          { key: 'name', label: 'Product', render: (r) => <Link className="font-medium text-brand-700 hover:underline" to={`/products/${r.productId}`}>{r.productName}</Link>, csv: (r) => r.productName },
          { key: 'sku', label: 'SKU', render: (r) => r.sku, csv: (r) => r.sku },
          { key: 'cat', label: 'Category', render: (r) => r.categoryName, csv: (r) => r.categoryName },
          { key: 'qty', label: 'Qty sold', render: (r) => qty(r.qty, r.unitSymbol), csv: (r) => r.qty, align: 'right' },
          { key: 'sales', label: 'Net sales (excl. GST)', render: (r) => money(r.netSales), csv: (r) => csvMoney(r.netSales), align: 'right' },
          ...(rows[0]?.profit !== null ? [{ key: 'profit', label: 'Gross profit', render: (r: (typeof rows)[number]) => money(r.profit), csv: (r: (typeof rows)[number]) => csvMoney(r.profit), align: 'right' as const }] : []),
        ]}
      />
    </Card>
  );
}

function CategoriesReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useReport<{ rows: { categoryId: number; categoryName: string; invoices: number; total: number; profit: number | null }[] }>('sales-by-category', { from, to });
  if (isLoading) return <Spinner />;
  const rows = data?.rows ?? [];
  const grand = rows.reduce((s, r) => s + r.total, 0);
  return (
    <Card bodyClassName="p-0">
      <ReportTable
        rows={rows}
        filename={`sales-by-category-${from}-to-${to}.csv`}
        columns={[
          { key: 'cat', label: 'Category', render: (r) => <span className="font-medium">{r.categoryName}</span>, csv: (r) => r.categoryName },
          { key: 'inv', label: 'Invoices', render: (r) => r.invoices, csv: (r) => r.invoices, align: 'right' },
          { key: 'total', label: 'Net sales (excl. GST)', render: (r) => money(r.total), csv: (r) => csvMoney(r.total), align: 'right' },
          { key: 'share', label: 'Share', render: (r) => (grand ? percent(Math.round((r.total / grand) * 1000) / 10) : '—'), csv: (r) => (grand ? Math.round((r.total / grand) * 1000) / 10 : 0), align: 'right' },
          ...(rows[0]?.profit !== null ? [{ key: 'profit', label: 'Gross profit', render: (r: (typeof rows)[number]) => money(r.profit), csv: (r: (typeof rows)[number]) => csvMoney(r.profit), align: 'right' as const }] : []),
        ]}
      />
    </Card>
  );
}

function CustomersReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useReport<{ rows: { customerId: number | null; customerName: string; invoices: number; total: number; paid: number; credit: number }[] }>('sales-by-customer', { from, to });
  if (isLoading) return <Spinner />;
  return (
    <Card bodyClassName="p-0">
      <ReportTable
        rows={data?.rows ?? []}
        filename={`sales-by-customer-${from}-to-${to}.csv`}
        columns={[
          { key: 'name', label: 'Customer', render: (r) => (r.customerId ? <Link className="font-medium text-brand-700 hover:underline" to={`/customers/${r.customerId}`}>{r.customerName}</Link> : r.customerName), csv: (r) => r.customerName },
          { key: 'inv', label: 'Invoices', render: (r) => r.invoices, csv: (r) => r.invoices, align: 'right' },
          { key: 'total', label: 'Total', render: (r) => money(r.total), csv: (r) => csvMoney(r.total), align: 'right' },
          { key: 'paid', label: 'Paid', render: (r) => money(r.paid), csv: (r) => csvMoney(r.paid), align: 'right' },
          { key: 'credit', label: 'On credit', render: (r) => money(r.credit), csv: (r) => csvMoney(r.credit), align: 'right' },
        ]}
      />
    </Card>
  );
}

function StaffReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useReport<{ rows: { userId: number; userName: string; invoices: number; total: number; discount: number }[] }>('sales-by-user', { from, to });
  if (isLoading) return <Spinner />;
  return (
    <Card bodyClassName="p-0">
      <ReportTable
        rows={data?.rows ?? []}
        filename={`sales-by-salesman-${from}-to-${to}.csv`}
        columns={[
          { key: 'name', label: 'Salesman', render: (r) => <span className="font-medium">{r.userName}</span>, csv: (r) => r.userName },
          { key: 'inv', label: 'Invoices', render: (r) => r.invoices, csv: (r) => r.invoices, align: 'right' },
          { key: 'total', label: 'Sales', render: (r) => money(r.total), csv: (r) => csvMoney(r.total), align: 'right' },
          { key: 'disc', label: 'Discount given', render: (r) => money(r.discount), csv: (r) => csvMoney(r.discount), align: 'right' },
        ]}
      />
    </Card>
  );
}

function MethodsReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useReport<{ rows: { method: string; received: number; paid: number; count: number }[] }>('payments-by-method', { from, to });
  if (isLoading) return <Spinner />;
  return (
    <Card bodyClassName="p-0">
      <ReportTable
        rows={data?.rows ?? []}
        filename={`payments-by-method-${from}-to-${to}.csv`}
        columns={[
          { key: 'method', label: 'Method', render: (r) => <span className="font-medium capitalize">{r.method.replace('_', ' ')}</span>, csv: (r) => r.method },
          { key: 'count', label: 'Transactions', render: (r) => r.count, csv: (r) => r.count, align: 'right' },
          { key: 'in', label: 'Received', render: (r) => money(r.received), csv: (r) => csvMoney(r.received), align: 'right' },
          { key: 'out', label: 'Paid out', render: (r) => money(r.paid), csv: (r) => csvMoney(r.paid), align: 'right' },
          { key: 'net', label: 'Net', render: (r) => money(r.received - r.paid), csv: (r) => csvMoney(r.received - r.paid), align: 'right' },
        ]}
      />
    </Card>
  );
}

interface ProfitLoss {
  grossSales: number;
  returns: number;
  netSales: number;
  discountsGiven: number;
  deliveryIncome: number;
  labourIncome: number;
  taxCollected: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  expenses: { category: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
  invoices: number;
}

function ProfitReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useReport<ProfitLoss>('profit-loss', { from, to });
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Net sales (excl. GST)" value={money(data.netSales)} hint={`${data.invoices} invoice(s)`} />
        <StatCard label="Cost of goods sold" value={money(data.cogs)} />
        <StatCard label="Gross profit" value={money(data.grossProfit)} tone={data.grossProfit >= 0 ? 'good' : 'bad'} hint={`Margin ${percent(data.grossMargin)}`} />
        <StatCard label="Net profit" value={money(data.netProfit)} tone={data.netProfit >= 0 ? 'good' : 'bad'} hint={`After ${money(data.totalExpenses)} expenses`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Trading account">
          <table className="table-base">
            <tbody>
              <tr>
                <td>Gross sales (excluding GST)</td>
                <td className="num">{money(data.grossSales)}</td>
              </tr>
              <tr>
                <td>Less: sale returns</td>
                <td className="num text-red-600">-{money(data.returns)}</td>
              </tr>
              <tr className="font-semibold">
                <td>Net sales</td>
                <td className="num">{money(data.netSales)}</td>
              </tr>
              <tr>
                <td>Less: cost of goods sold</td>
                <td className="num text-red-600">-{money(data.cogs)}</td>
              </tr>
              <tr className="bg-slate-50 font-semibold">
                <td>Gross profit</td>
                <td className="num">{money(data.grossProfit)}</td>
              </tr>
              <tr>
                <td>Less: total expenses</td>
                <td className="num text-red-600">-{money(data.totalExpenses)}</td>
              </tr>
              <tr className="bg-slate-50 text-base font-bold">
                <td>Net profit</td>
                <td className="num">{money(data.netProfit)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">
            Memo: discounts given {money(data.discountsGiven)} · delivery income {money(data.deliveryIncome)} · labour income {money(data.labourIncome)} · GST collected {money(data.taxCollected)}
          </p>
        </Card>
        <Card title="Expenses by category" bodyClassName="p-0">
          <ReportTable
            rows={data.expenses}
            filename={`expenses-${from}-to-${to}.csv`}
            empty="No expenses in this period"
            columns={[
              { key: 'cat', label: 'Category', render: (r) => r.category, csv: (r) => r.category },
              { key: 'amt', label: 'Amount', render: (r) => money(r.amount), csv: (r) => csvMoney(r.amount), align: 'right' },
            ]}
            footer={
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td>Total</td>
                  <td className="num">{money(data.totalExpenses)}</td>
                </tr>
              </tfoot>
            }
          />
        </Card>
      </div>
    </div>
  );
}

interface StockAnalysisRow {
  productId: number;
  sku: string;
  productName: string;
  categoryName: string;
  unitSymbol: string;
  qty: number;
  costPrice: number;
  salePrice: number;
  costValue: number;
  saleValue: number;
  potentialProfit: number;
  purchasedQty: number;
  purchasedValue: number;
  soldQty: number;
  soldValue: number;
  realizedProfit: number;
}

function StockAnalysisReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useReport<{ rows: StockAnalysisRow[]; totals: Record<string, number> }>('stock-analysis', { from, to });
  if (isLoading || !data) return <Spinner />;
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Stock value (at cost)" value={money(t.stockCostValue)} hint={`Sale value ${money(t.stockSaleValue)}`} />
        <StatCard label="Profit locked in stock" value={money(t.potentialProfit)} hint="If all stock sells at list price" />
        <StatCard label="Sold in period" value={money(t.soldValue)} hint={`Cost ${money(t.soldCost)}`} />
        <StatCard label="Realised profit" value={money(t.realizedProfit)} tone={t.realizedProfit >= 0 ? 'good' : 'bad'} hint={`Net after expenses ${money(t.netProfit)}`} />
        <StatCard label="Purchased in period" value={money(t.purchasedValue)} />
        <StatCard label="Outstanding from customers" value={money(t.receivables)} tone={t.receivables > 0 ? 'warn' : 'default'} />
        <StatCard label="Expenses in period" value={money(t.expenses)} />
      </div>
      <Card bodyClassName="p-0" title="Product-wise stock, purchase, sale and profit">
        <ReportTable
          rows={data.rows}
          filename={`stock-profit-analysis-${from}-to-${to}.csv`}
          columns={[
            { key: 'name', label: 'Product', render: (r) => <Link className="font-medium text-brand-700 hover:underline" to={`/products/${r.productId}`}>{r.productName}</Link>, csv: (r) => r.productName },
            { key: 'cat', label: 'Category', render: (r) => r.categoryName, csv: (r) => r.categoryName },
            { key: 'stock', label: 'In stock', render: (r) => qty(r.qty, r.unitSymbol), csv: (r) => r.qty, align: 'right' },
            { key: 'cost', label: 'Avg cost', render: (r) => money(r.costPrice), csv: (r) => csvMoney(r.costPrice), align: 'right' },
            { key: 'costv', label: 'Stock cost value', render: (r) => money(r.costValue), csv: (r) => csvMoney(r.costValue), align: 'right' },
            { key: 'salev', label: 'Stock sale value', render: (r) => money(r.saleValue), csv: (r) => csvMoney(r.saleValue), align: 'right' },
            { key: 'pot', label: 'Potential profit', render: (r) => money(r.potentialProfit), csv: (r) => csvMoney(r.potentialProfit), align: 'right' },
            { key: 'bought', label: 'Purchased', render: (r) => qty(r.purchasedQty, r.unitSymbol), csv: (r) => r.purchasedQty, align: 'right' },
            { key: 'sold', label: 'Sold', render: (r) => qty(r.soldQty, r.unitSymbol), csv: (r) => r.soldQty, align: 'right' },
            { key: 'soldv', label: 'Sale value', render: (r) => money(r.soldValue), csv: (r) => csvMoney(r.soldValue), align: 'right' },
            { key: 'rp', label: 'Profit earned', render: (r) => <span className={r.realizedProfit >= 0 ? '' : 'text-red-600'}>{money(r.realizedProfit)}</span>, csv: (r) => csvMoney(r.realizedProfit), align: 'right' },
          ]}
        />
      </Card>
    </div>
  );
}

function ValuationReport() {
  const { data, isLoading } = useReport<{ rows: { productId: number; sku: string; productName: string; categoryName: string; brandName: string | null; unitSymbol: string; qty: number; costPrice: number | null; salePrice: number; costValue: number | null; saleValue: number }[]; totalCostValue: number | null; totalSaleValue: number }>('inventory-valuation', {});
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Stock value at cost" value={data.totalCostValue === null ? '—' : money(data.totalCostValue)} />
        <StatCard label="Stock value at sale price" value={money(data.totalSaleValue)} />
        <StatCard label="Products in stock" value={data.rows.filter((r) => r.qty > 0).length} />
      </div>
      <Card bodyClassName="p-0">
        <ReportTable
          rows={data.rows}
          filename="inventory-valuation.csv"
          columns={[
            { key: 'name', label: 'Product', render: (r) => <Link className="font-medium text-brand-700 hover:underline" to={`/products/${r.productId}`}>{r.productName}</Link>, csv: (r) => r.productName },
            { key: 'sku', label: 'SKU', render: (r) => r.sku, csv: (r) => r.sku },
            { key: 'cat', label: 'Category', render: (r) => r.categoryName, csv: (r) => r.categoryName },
            { key: 'brand', label: 'Brand', render: (r) => r.brandName ?? '—', csv: (r) => r.brandName },
            { key: 'qty', label: 'Stock', render: (r) => qty(r.qty, r.unitSymbol), csv: (r) => r.qty, align: 'right' },
            { key: 'cost', label: 'Cost', render: (r) => (r.costPrice === null ? '—' : money(r.costPrice)), csv: (r) => csvMoney(r.costPrice), align: 'right' },
            { key: 'costv', label: 'Cost value', render: (r) => (r.costValue === null ? '—' : money(r.costValue)), csv: (r) => csvMoney(r.costValue), align: 'right' },
            { key: 'sale', label: 'Sale price', render: (r) => money(r.salePrice), csv: (r) => csvMoney(r.salePrice), align: 'right' },
            { key: 'salev', label: 'Sale value', render: (r) => money(r.saleValue), csv: (r) => csvMoney(r.saleValue), align: 'right' },
          ]}
        />
      </Card>
    </div>
  );
}

function ReceivablesReport() {
  const { data, isLoading } = useReport<{ rows: { customerId: number; customerName: string; phone: string | null; customerType: string; creditLimit: number | null; balance: number; lastSaleDate: string | null; lastPaymentDate: string | null; dueDate: string | null; overdue: boolean }[]; total: number; overdueTotal: number }>('receivables', {});
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total receivable" value={money(data.total)} tone="warn" />
        <StatCard label="Overdue (agreement past due)" value={money(data.overdueTotal)} tone={data.overdueTotal > 0 ? 'bad' : 'default'} />
        <StatCard label="Customers with balance" value={data.rows.length} />
      </div>
      <Card bodyClassName="p-0">
        <ReportTable
          rows={data.rows}
          filename="receivables.csv"
          empty="No outstanding customer balances"
          columns={[
            { key: 'name', label: 'Customer', render: (r) => <Link className="font-medium text-brand-700 hover:underline" to={`/customers/${r.customerId}`}>{r.customerName}</Link>, csv: (r) => r.customerName },
            { key: 'phone', label: 'Phone', render: (r) => r.phone ?? '—', csv: (r) => r.phone },
            { key: 'bal', label: 'Balance', render: (r) => <span className="font-semibold text-red-600">{money(r.balance)}</span>, csv: (r) => csvMoney(r.balance), align: 'right' },
            { key: 'limit', label: 'Credit limit', render: (r) => (r.creditLimit === null ? 'No limit' : money(r.creditLimit)), csv: (r) => csvMoney(r.creditLimit), align: 'right' },
            { key: 'due', label: 'Agreement due', render: (r) => (r.dueDate ? <span className={r.overdue ? 'font-medium text-red-600' : ''}>{dateLabel(r.dueDate)}</span> : '—'), csv: (r) => r.dueDate },
            { key: 'sale', label: 'Last sale', render: (r) => dateLabel(r.lastSaleDate), csv: (r) => r.lastSaleDate },
            { key: 'pay', label: 'Last payment', render: (r) => dateLabel(r.lastPaymentDate), csv: (r) => r.lastPaymentDate },
          ]}
        />
      </Card>
    </div>
  );
}

function PayablesReport() {
  const { data, isLoading } = useReport<{ rows: { supplierId: number; supplierName: string; company: string | null; phone: string | null; balance: number; lastPurchaseDate: string | null; lastPaymentDate: string | null }[]; total: number }>('payables', {});
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <StatCard label="Total payable to suppliers" value={money(data.total)} />
      <Card bodyClassName="p-0">
        <ReportTable
          rows={data.rows}
          filename="payables.csv"
          empty="No outstanding supplier balances"
          columns={[
            { key: 'name', label: 'Supplier', render: (r) => <Link className="font-medium text-brand-700 hover:underline" to={`/suppliers/${r.supplierId}`}>{r.supplierName}</Link>, csv: (r) => r.supplierName },
            { key: 'company', label: 'Company', render: (r) => r.company ?? '—', csv: (r) => r.company },
            { key: 'phone', label: 'Phone', render: (r) => r.phone ?? '—', csv: (r) => r.phone },
            { key: 'bal', label: 'Payable', render: (r) => <span className="font-semibold text-amber-700">{money(r.balance)}</span>, csv: (r) => csvMoney(r.balance), align: 'right' },
            { key: 'pur', label: 'Last purchase', render: (r) => dateLabel(r.lastPurchaseDate), csv: (r) => r.lastPurchaseDate },
            { key: 'pay', label: 'Last payment', render: (r) => dateLabel(r.lastPaymentDate), csv: (r) => r.lastPaymentDate },
          ]}
        />
      </Card>
    </div>
  );
}

function TaxReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useReport<{ byRate: { rate: number; taxableValue: number; tax: number }[]; outputTax: number; returnsTax: number; netOutputTax: number; inputTax: number; invoices: { id: number; invoiceNo: string; saleDate: string; customerName: string | null; customerNtn: string | null; customerCnic: string | null; taxableValue: number; taxTotal: number; grandTotal: number; fbrInvoiceNo: string | null }[] }>('tax', { from, to });
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Output tax (sales)" value={money(data.outputTax)} />
        <StatCard label="Tax on returns" value={money(data.returnsTax)} />
        <StatCard label="Net output tax" value={money(data.netOutputTax)} tone="warn" />
        <StatCard label="Input tax (purchases)" value={money(data.inputTax)} hint={`Net payable ${money(data.netOutputTax - data.inputTax)}`} />
      </div>
      <Card title="By tax rate" bodyClassName="p-0">
        <ReportTable
          rows={data.byRate}
          filename={`gst-by-rate-${from}-to-${to}.csv`}
          columns={[
            { key: 'rate', label: 'Rate', render: (r) => percent(r.rate), csv: (r) => r.rate },
            { key: 'value', label: 'Taxable value', render: (r) => money(r.taxableValue), csv: (r) => csvMoney(r.taxableValue), align: 'right' },
            { key: 'tax', label: 'GST', render: (r) => money(r.tax), csv: (r) => csvMoney(r.tax), align: 'right' },
          ]}
        />
      </Card>
      <Card title="Taxable invoices" bodyClassName="p-0">
        <ReportTable
          rows={data.invoices}
          filename={`gst-invoices-${from}-to-${to}.csv`}
          columns={[
            { key: 'no', label: 'Invoice', render: (r) => <Link className="font-medium text-brand-700 hover:underline" to={`/sales/${r.id}`}>{r.invoiceNo}</Link>, csv: (r) => r.invoiceNo },
            { key: 'date', label: 'Date', render: (r) => dateLabel(r.saleDate), csv: (r) => r.saleDate },
            { key: 'cust', label: 'Buyer', render: (r) => r.customerName ?? 'Walk-in', csv: (r) => r.customerName },
            { key: 'ntn', label: 'NTN / CNIC', render: (r) => r.customerNtn ?? r.customerCnic ?? '—', csv: (r) => r.customerNtn ?? r.customerCnic },
            { key: 'value', label: 'Taxable value', render: (r) => money(r.taxableValue), csv: (r) => csvMoney(r.taxableValue), align: 'right' },
            { key: 'tax', label: 'GST', render: (r) => money(r.taxTotal), csv: (r) => csvMoney(r.taxTotal), align: 'right' },
            { key: 'total', label: 'Invoice total', render: (r) => money(r.grandTotal), csv: (r) => csvMoney(r.grandTotal), align: 'right' },
            { key: 'fbr', label: 'FBR invoice no.', render: (r) => r.fbrInvoiceNo ?? '—', csv: (r) => r.fbrInvoiceNo },
          ]}
        />
      </Card>
    </div>
  );
}

export function ReportsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<ReportTab>('summary');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const profit = can('reports.profit');
  const needsRange = !['valuation', 'receivables', 'payables'].includes(tab);

  const tabs = [
    { value: 'summary' as ReportTab, label: 'Sales summary' },
    { value: 'products' as ReportTab, label: 'By product' },
    { value: 'categories' as ReportTab, label: 'By category' },
    { value: 'customers' as ReportTab, label: 'By customer' },
    { value: 'staff' as ReportTab, label: 'By salesman' },
    { value: 'methods' as ReportTab, label: 'Payment methods' },
    ...(profit ? [{ value: 'profit' as ReportTab, label: 'Profit & loss' }, { value: 'stock-analysis' as ReportTab, label: 'Stock & profit analysis' }] : []),
    { value: 'valuation' as ReportTab, label: 'Stock valuation' },
    { value: 'receivables' as ReportTab, label: 'Receivables' },
    { value: 'payables' as ReportTab, label: 'Payables' },
    { value: 'tax' as ReportTab, label: 'GST / tax' },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Sales, profit, stock, receivables and tax — export to CSV or print any report"
        actions={needsRange ? <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /> : undefined}
      />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'summary' && <SummaryReport from={from} to={to} />}
      {tab === 'products' && <ProductsReport from={from} to={to} />}
      {tab === 'categories' && <CategoriesReport from={from} to={to} />}
      {tab === 'customers' && <CustomersReport from={from} to={to} />}
      {tab === 'staff' && <StaffReport from={from} to={to} />}
      {tab === 'methods' && <MethodsReport from={from} to={to} />}
      {tab === 'profit' && <ProfitReport from={from} to={to} />}
      {tab === 'stock-analysis' && <StockAnalysisReport from={from} to={to} />}
      {tab === 'valuation' && <ValuationReport />}
      {tab === 'receivables' && <ReceivablesReport />}
      {tab === 'payables' && <PayablesReport />}
      {tab === 'tax' && <TaxReport from={from} to={to} />}
    </div>
  );
}
