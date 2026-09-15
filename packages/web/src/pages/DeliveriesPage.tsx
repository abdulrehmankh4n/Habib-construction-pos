import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer, Truck } from 'lucide-react';
import { DELIVERY_STATUS_LABELS, type Paginated, type Sale } from '@pos/shared';
import { api } from '../lib/api';
import { dateTimeLabel, money } from '../lib/format';
import { printUrl } from '../lib/print';
import { Badge, Button, Card, EmptyState, PageHeader, Pagination, Select, Spinner, TableWrap } from '../components/ui';
import { DeliveryModal } from './sales/SaleDetailPage';

export function DeliveriesPage() {
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Sale | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['sales', 'deliveries', status, page],
    queryFn: () => api.get<Paginated<Sale>>('/sales', { delivery: status, status: 'completed', page, pageSize: 50 }),
  });

  const openEdit = async (id: number) => setEditing(await api.get<Sale>(`/sales/${id}`));

  return (
    <div>
      <PageHeader title="Deliveries" subtitle="Track sand, crush, bricks and steel deliveries to sites" />
      <Card
        bodyClassName="p-0"
        actions={
          <Select className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Delivery status">
            <option value="open">Pending & dispatched</option>
            <option value="pending">Pending</option>
            <option value="dispatched">Dispatched</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        }
      >
        {isLoading ? (
          <Spinner />
        ) : !data?.data.length ? (
          <EmptyState icon={<Truck className="h-8 w-8" />} title="No deliveries" description="Sales marked 'Delivery required' at checkout appear here." />
        ) : (
          <>
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Vehicle / Driver</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/sales/${s.id}`} className="font-medium text-brand-700 hover:underline">
                          {s.invoiceNo}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap text-slate-600">{dateTimeLabel(s.saleDate)}</td>
                      <td>
                        {s.customerName ?? 'Walk-in'}
                        <p className="text-xs text-slate-500">{s.customerPhone}</p>
                      </td>
                      <td className="max-w-xs text-sm">{s.deliveryAddress ?? '—'}</td>
                      <td className="text-sm">
                        {s.vehicleNo ?? '—'}
                        <p className="text-xs text-slate-500">{[s.driverName, s.driverPhone].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="num">{money(s.grandTotal)}</td>
                      <td>
                        <Badge color={s.deliveryStatus === 'delivered' ? 'green' : s.deliveryStatus === 'cancelled' ? 'red' : s.deliveryStatus === 'dispatched' ? 'blue' : 'amber'}>
                          {DELIVERY_STATUS_LABELS[s.deliveryStatus ?? 'pending']}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button size="xs" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => printUrl(`/print/sale/${s.id}?format=challan`)}>
                            Challan
                          </Button>
                          <Button size="xs" variant="primary" onClick={() => openEdit(s.id)}>
                            Update
                          </Button>
                        </div>
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
      {editing && <DeliveryModal sale={editing} open onClose={() => setEditing(null)} />}
    </div>
  );
}
