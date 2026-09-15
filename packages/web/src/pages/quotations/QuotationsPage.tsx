import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import type { Paginated, Quotation } from '@pos/shared';
import { api } from '../../lib/api';
import { useDebounce } from '../../lib/hooks';
import { dateLabel, dateTimeLabel, money, today } from '../../lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, Pagination, SearchInput, Select, Spinner, TableWrap } from '../../components/ui';

export function QuotationStatus({ q }: { q: Quotation }) {
  if (q.status === 'converted') return <Badge color="green">Converted</Badge>;
  if (q.status === 'cancelled') return <Badge color="red">Cancelled</Badge>;
  if (q.validUntil && q.validUntil < today()) return <Badge color="gray">Expired</Badge>;
  return <Badge color="blue">Open</Badge>;
}

export function QuotationsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 300);
  const { data, isLoading } = useQuery({
    queryKey: ['quotations', debounced, status, page],
    queryFn: () => api.get<Paginated<Quotation>>('/quotations', { search: debounced, status, page, pageSize: 50 }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Estimates for contractors and builders — convert to a sale in one click"
        actions={
          <Link to="/pos">
            <Button variant="primary">New quotation</Button>
          </Link>
        }
      />
      <Card
        bodyClassName="p-0"
        actions={
          <>
            <SearchInput className="w-60" value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Quotation no. or customer" />
            <Select className="w-36" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="converted">Converted</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </>
        }
      >
        {isLoading ? (
          <Spinner />
        ) : !data?.data.length ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="No quotations" description="Switch the POS to Quotation mode to prepare an estimate." />
        ) : (
          <>
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Quotation</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Valid until</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <Link to={`/quotations/${q.id}`} className="font-medium text-brand-700 hover:underline">
                          {q.quotationNo}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap text-slate-600">{dateTimeLabel(q.quotationDate)}</td>
                      <td>{q.customerName ?? '—'}</td>
                      <td className="text-slate-600">{dateLabel(q.validUntil)}</td>
                      <td className="num font-medium">{money(q.grandTotal)}</td>
                      <td>
                        <QuotationStatus q={q} />
                        {q.saleInvoiceNo && <span className="ml-1 text-xs text-slate-500">{q.saleInvoiceNo}</span>}
                      </td>
                      <td className="text-slate-600">{q.createdByName}</td>
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
