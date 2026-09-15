import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, ShoppingBag } from 'lucide-react';
import type { Paginated, Purchase } from '@pos/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDebounce } from '../../lib/hooks';
import { dateLabel, money, monthStart, today } from '../../lib/format';
import { Badge, Button, Card, DateRange, EmptyState, PageHeader, Pagination, SearchInput, Spinner, TableWrap } from '../../components/ui';

export function PurchasesPage() {
  const { can } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 300);
  const { data, isLoading } = useQuery({
    queryKey: ['purchases', from, to, debounced, page],
    queryFn: () => api.get<Paginated<Purchase> & { summary: { grandTotal: number } }>('/purchases', { from, to, search: debounced, page, pageSize: 50 }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Stock received from suppliers (GRN) — updates stock, average cost and supplier balance"
        actions={
          can('purchases.manage') && (
            <Link to="/purchases/new">
              <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                New purchase
              </Button>
            </Link>
          )
        }
      />
      <Card
        bodyClassName="p-0"
        title={<DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />}
        actions={<SearchInput className="w-64" value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Purchase no, bill no, supplier, vehicle" />}
      >
        {isLoading ? (
          <Spinner />
        ) : !data?.data.length ? (
          <EmptyState icon={<ShoppingBag className="h-8 w-8" />} title="No purchases in this period" />
        ) : (
          <>
            <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-500">
              Total purchases: <span className="font-semibold text-slate-900">{money(data.summary.grandTotal)}</span>
            </div>
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Purchase</th>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>Bill no.</th>
                    <th>Vehicle</th>
                    <th className="num">Total</th>
                    <th className="num">Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((p) => (
                    <tr key={p.id} className={p.status === 'void' ? 'opacity-60' : undefined}>
                      <td>
                        <Link to={`/purchases/${p.id}`} className="font-medium text-brand-700 hover:underline">
                          {p.purchaseNo}
                        </Link>
                      </td>
                      <td className="text-slate-600">{dateLabel(p.purchaseDate)}</td>
                      <td>
                        <Link to={`/suppliers/${p.supplierId}`} className="hover:underline">
                          {p.supplierName}
                        </Link>
                      </td>
                      <td className="text-slate-600">{p.supplierInvoiceNo ?? '—'}</td>
                      <td className="text-slate-600">{p.vehicleNo ?? '—'}</td>
                      <td className="num font-medium">{money(p.grandTotal)}</td>
                      <td className="num">{money(p.paidAmount)}</td>
                      <td>
                        {p.status === 'void' ? (
                          <Badge color="red">Cancelled</Badge>
                        ) : p.paidAmount >= p.grandTotal ? (
                          <Badge color="green">Paid</Badge>
                        ) : (
                          <Badge color="amber">Payable {money(p.grandTotal - p.paidAmount)}</Badge>
                        )}
                        {p.returnedTotal > 0 && <Badge color="violet" className="ml-1">Returned</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <Pagination page={page} pageSize={50} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
