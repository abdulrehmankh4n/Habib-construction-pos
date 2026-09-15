import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileSignature, Package, ShoppingCart, Truck } from 'lucide-react';
import type { DashboardData } from '@pos/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTimeLabel, money, qty } from '../lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, StatCard } from '../components/ui';
import { SalesTrendChart } from '../components/SalesTrendChart';

export function DashboardPage() {
  const { can } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/reports/dashboard'),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) return <Spinner />;
  const showProfit = data.today.grossProfit !== null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle="Today's business at a glance"
        actions={
          can('pos.sell') && (
            <Link to="/pos">
              <Button variant="primary" icon={<ShoppingCart className="h-4 w-4" />}>
                New Sale
              </Button>
            </Link>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Today's sales" value={money(data.today.salesTotal)} hint={`${data.today.salesCount} invoice(s)`} />
        <StatCard label="Cash received today" value={money(data.today.cashReceived)} hint="Sales + customer payments" />
        <StatCard label="Credit (udhaar) today" value={money(data.today.creditSales)} tone={data.today.creditSales > 0 ? 'warn' : 'default'} />
        {showProfit ? (
          <StatCard label="Gross profit today" value={money(data.today.grossProfit)} tone={(data.today.grossProfit ?? 0) >= 0 ? 'good' : 'bad'} hint="Excl. GST, after cost" />
        ) : (
          <StatCard label="Returns today" value={money(data.today.returnsTotal)} />
        )}
        <StatCard label="Receivables (customers owe)" value={money(data.receivables)} tone={data.receivables > 0 ? 'warn' : 'default'} />
        <StatCard label="Payables (we owe suppliers)" value={money(data.payables)} />
        <StatCard label="This month's net sales" value={money(data.month.salesTotal)} hint={showProfit ? `Gross profit ${money(data.month.grossProfit)}` : undefined} />
        <StatCard
          label="Stock worth"
          value={money(data.stockCostValue ?? data.stockSaleValue)}
          hint={data.stockCostValue !== null ? `At cost · ${money(data.stockSaleValue)} at sale price` : 'At sale price'}
        />
      </div>

      {(data.lowStockCount > 0 || data.pendingDeliveries > 0 || data.agreementsDue > 0 || data.fbrPending > 0) && (
        <div className="flex flex-wrap gap-2">
          {data.lowStockCount > 0 && (
            <Link to="/stock?tab=low" className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100">
              <AlertTriangle className="h-4 w-4" /> {data.lowStockCount} product(s) at or below minimum stock
            </Link>
          )}
          {data.pendingDeliveries > 0 && (
            <Link to="/deliveries" className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 hover:bg-sky-100">
              <Truck className="h-4 w-4" /> {data.pendingDeliveries} delivery(ies) pending
            </Link>
          )}
          {data.agreementsDue > 0 && (
            <Link to="/agreements" className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 hover:bg-red-100">
              <FileSignature className="h-4 w-4" /> {data.agreementsDue} credit agreement(s) due within 7 days or overdue
            </Link>
          )}
          {data.fbrPending > 0 && (
            <Link to="/sales?fbr=failed" className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
              {data.fbrPending} invoice(s) waiting for FBR sync
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Daily sales (last 14 days)" className="xl:col-span-2">
          <SalesTrendChart data={data.salesTrend} />
        </Card>
        <Card title="Top products this month" bodyClassName="p-0">
          {data.topProducts.length === 0 ? (
            <EmptyState title="No sales yet this month" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.topProducts.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-5 text-xs font-semibold text-slate-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{p.productName}</p>
                    <p className="text-xs text-slate-500">{qty(p.qty, p.unitSymbol)}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-800">{money(p.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Recent sales" bodyClassName="p-0" actions={<Link to="/sales" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>}>
          {data.recentSales.length === 0 ? (
            <EmptyState title="No sales recorded yet" />
          ) : (
            <table className="table-base">
              <tbody>
                {data.recentSales.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/sales/${s.id}`} className="font-medium text-brand-700 hover:underline">
                        {s.invoiceNo}
                      </Link>
                      <p className="text-xs text-slate-500">{dateTimeLabel(s.saleDate)}</p>
                    </td>
                    <td className="text-sm">{s.customerName ?? 'Walk-in'}</td>
                    <td className="num font-medium">
                      {s.status === 'void' ? <Badge color="red">Cancelled</Badge> : money(s.grandTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Low stock" bodyClassName="p-0" actions={<Link to="/stock?tab=low" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>}>
          {data.lowStock.length === 0 ? (
            <EmptyState icon={<Package className="h-8 w-8" />} title="All products are above minimum stock" />
          ) : (
            <table className="table-base">
              <tbody>
                {data.lowStock.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/products/${p.id}`} className="font-medium text-slate-800 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="num text-red-600">{qty(p.stockQty, p.unitSymbol)}</td>
                    <td className="num text-xs text-slate-500">min {qty(p.minStock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
