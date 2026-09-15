import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Receipt } from 'lucide-react';
import { REFUND_METHOD_LABELS, type Paginated, type Sale, type SaleReturn } from '@pos/shared';
import { api } from '../../lib/api';
import { useDebounce } from '../../lib/hooks';
import { csvMoney, dateTimeLabel, downloadCsv, money, monthStart, today } from '../../lib/format';
import { Badge, Button, Card, DateRange, EmptyState, PageHeader, Pagination, SearchInput, Select, Spinner, Tabs, TableWrap } from '../../components/ui';

export function SaleStatusBadges({ sale }: { sale: Sale }) {
  return (
    <div className="flex flex-wrap gap-1">
      {sale.status === 'void' ? (
        <Badge color="red">Cancelled</Badge>
      ) : sale.balanceDue > 0 ? (
        <Badge color="amber">Credit {money(sale.balanceDue)}</Badge>
      ) : (
        <Badge color="green">Paid</Badge>
      )}
      {sale.returnedTotal > 0 && <Badge color="violet">Returned {money(sale.returnedTotal)}</Badge>}
      {sale.deliveryStatus && sale.deliveryStatus !== 'delivered' && sale.status !== 'void' && <Badge color="blue">Delivery {sale.deliveryStatus}</Badge>}
      {sale.fbrStatus === 'failed' && <Badge color="red">FBR failed</Badge>}
      {sale.fbrStatus === 'pending' && <Badge color="gray">FBR pending</Badge>}
    </div>
  );
}

function SalesList() {
  const [params] = useSearchParams();
  const [from, setFrom] = useState(params.get('fbr') ? '' : monthStart());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [payment, setPayment] = useState('');
  const [fbr, setFbr] = useState(params.get('fbr') ?? '');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 300);
  const query = { from, to, search: debounced, status, payment, fbr, page, pageSize: 50 };
  const { data, isLoading } = useQuery({
    queryKey: ['sales', query],
    queryFn: () => api.get<Paginated<Sale> & { summary: { grandTotal: number; balanceDue: number } }>('/sales', query),
    placeholderData: (prev) => prev,
  });

  const exportCsv = async () => {
    const all = await api.get<Paginated<Sale>>('/sales', { ...query, page: 1, pageSize: 200 });
    downloadCsv(`sales-${from}-to-${to}.csv`, [
      ['Invoice', 'Date', 'Customer', 'Status', 'Subtotal', 'Discount', 'GST', 'Delivery', 'Labour', 'Total', 'Paid', 'Credit', 'Returned', 'Salesman'],
      ...all.data.map((s) => [
        s.invoiceNo,
        s.saleDate,
        s.customerName ?? 'Walk-in',
        s.status,
        csvMoney(s.subtotal),
        csvMoney(s.itemDiscount + s.billDiscount),
        csvMoney(s.taxTotal),
        csvMoney(s.deliveryCharges),
        csvMoney(s.labourCharges),
        csvMoney(s.grandTotal),
        csvMoney(s.paidAmount),
        csvMoney(s.balanceDue),
        csvMoney(s.returnedTotal),
        s.createdByName,
      ]),
    ]);
  };

  return (
    <Card
      bodyClassName="p-0"
      title={
        <div className="flex flex-wrap items-center gap-2">
          <DateRange
            from={from}
            to={to}
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
              setPage(1);
            }}
          />
        </div>
      }
      actions={
        <>
          <SearchInput className="w-56" value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Invoice, customer, vehicle…" />
          <Select className="w-32" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
            <option value="">All status</option>
            <option value="completed">Completed</option>
            <option value="void">Cancelled</option>
          </Select>
          <Select className="w-32" value={payment} onChange={(e) => { setPayment(e.target.value); setPage(1); }} aria-label="Payment">
            <option value="">All payments</option>
            <option value="paid">Fully paid</option>
            <option value="credit">On credit</option>
          </Select>
          <Select className="w-32" value={fbr} onChange={(e) => { setFbr(e.target.value); setPage(1); }} aria-label="FBR status">
            <option value="">FBR: any</option>
            <option value="synced">Synced</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </Select>
          <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>
            CSV
          </Button>
        </>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : !data?.data.length ? (
        <EmptyState icon={<Receipt className="h-8 w-8" />} title="No sales found" description="Try a different date range or filter." />
      ) : (
        <>
          <div className="flex flex-wrap gap-6 border-b border-slate-100 px-4 py-2 text-sm">
            <span className="text-slate-500">
              Total sales: <span className="font-semibold text-slate-900">{money(data.summary.grandTotal)}</span>
            </span>
            <span className="text-slate-500">
              On credit: <span className="font-semibold text-amber-700">{money(data.summary.balanceDue)}</span>
            </span>
          </div>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th className="num">Items</th>
                  <th className="num">Total</th>
                  <th className="num">Paid</th>
                  <th>Status</th>
                  <th>Salesman</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((s) => (
                  <tr key={s.id} className={s.status === 'void' ? 'opacity-60' : undefined}>
                    <td>
                      <Link to={`/sales/${s.id}`} className="font-medium text-brand-700 hover:underline">
                        {s.invoiceNo}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{dateTimeLabel(s.saleDate)}</td>
                    <td>
                      {s.customerId ? (
                        <Link to={`/customers/${s.customerId}`} className="hover:underline">
                          {s.customerName}
                        </Link>
                      ) : (
                        <span className="text-slate-600">{s.customerName ?? 'Walk-in'}</span>
                      )}
                    </td>
                    <td className="num">{s.itemCount}</td>
                    <td className="num font-medium">{money(s.grandTotal)}</td>
                    <td className="num">{money(s.paidAmount)}</td>
                    <td>
                      <SaleStatusBadges sale={s} />
                    </td>
                    <td className="text-slate-600">{s.createdByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pagination page={page} pageSize={50} total={data.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

function ReturnsList() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['sales', 'returns', from, to, page],
    queryFn: () => api.get<Paginated<SaleReturn>>('/sales/returns', { from, to, page, pageSize: 50 }),
  });
  return (
    <Card bodyClassName="p-0" title={<DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />}>
      {isLoading ? (
        <Spinner />
      ) : !data?.data.length ? (
        <EmptyState title="No returns in this period" />
      ) : (
        <>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Return no.</th>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th className="num">Amount</th>
                  <th>Refund</th>
                  <th>Reason</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <a href={`/print/return/${r.id}`} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">
                        {r.returnNo}
                      </a>
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{dateTimeLabel(r.returnDate)}</td>
                    <td>
                      <Link to={`/sales/${r.saleId}`} className="hover:underline">
                        {r.invoiceNo}
                      </Link>
                    </td>
                    <td>{r.customerName ?? 'Walk-in'}</td>
                    <td className="num font-medium">{money(r.totalAmount)}</td>
                    <td>{REFUND_METHOD_LABELS[r.refundMethod]}</td>
                    <td className="max-w-xs truncate text-slate-600">{r.reason}</td>
                    <td className="text-slate-600">{r.createdByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pagination page={page} pageSize={50} total={data.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

export function SalesPage() {
  const [tab, setTab] = useState<'sales' | 'returns'>('sales');
  return (
    <div>
      <PageHeader
        title="Sales & Returns"
        subtitle="Invoices, credit sales, returns and cancellations"
        actions={
          <Link to="/pos">
            <Button variant="primary">New sale</Button>
          </Link>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'sales', label: 'Sales invoices' },
          { value: 'returns', label: 'Sale returns' },
        ]}
      />
      {tab === 'sales' ? <SalesList /> : <ReturnsList />}
    </div>
  );
}
