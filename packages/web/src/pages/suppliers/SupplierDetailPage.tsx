import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HandCoins, Pencil, Plus, Scale } from 'lucide-react';
import type { Paginated, Purchase, Supplier } from '@pos/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dateLabel, money } from '../../lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, StatCard, Tabs, TableWrap } from '../../components/ui';
import { LedgerView } from '../../components/LedgerView';
import { BalanceAdjustModal, PaymentModal } from '../../components/PaymentForm';
import { SupplierFormModal } from './SuppliersPage';

function PurchasesTab({ supplierId }: { supplierId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['purchases', 'supplier', supplierId],
    queryFn: () => api.get<Paginated<Purchase>>('/purchases', { supplierId, pageSize: 100 }),
  });
  if (isLoading) return <Spinner />;
  if (!data?.data.length) return <EmptyState title="No purchases from this supplier yet" />;
  return (
    <Card bodyClassName="p-0">
      <TableWrap>
        <table className="table-base">
          <thead>
            <tr>
              <th>Purchase</th>
              <th>Date</th>
              <th>Bill no.</th>
              <th className="num">Total</th>
              <th className="num">Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/purchases/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.purchaseNo}
                  </Link>
                </td>
                <td className="text-slate-600">{dateLabel(p.purchaseDate)}</td>
                <td className="text-slate-600">{p.supplierInvoiceNo ?? '—'}</td>
                <td className="num font-medium">{money(p.grandTotal)}</td>
                <td className="num">{money(p.paidAmount)}</td>
                <td>
                  {p.status === 'void' ? (
                    <Badge color="red">Cancelled</Badge>
                  ) : p.paidAmount >= p.grandTotal ? (
                    <Badge color="green">Paid</Badge>
                  ) : (
                    <Badge color="amber">Payable</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

export function SupplierDetailPage() {
  const { id } = useParams();
  const supplierId = Number(id);
  const { can } = useAuth();
  const [tab, setTab] = useState<'ledger' | 'purchases'>('ledger');
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const { data: supplier, isLoading } = useQuery({ queryKey: ['suppliers', 'detail', supplierId], queryFn: () => api.get<Supplier>(`/suppliers/${supplierId}`) });

  if (isLoading || !supplier) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {supplier.name} {!supplier.isActive && <Badge color="red">Inactive</Badge>}
          </span>
        }
        subtitle={[supplier.company, supplier.phone, supplier.city, supplier.ntn ? `NTN ${supplier.ntn}` : null].filter(Boolean).join(' · ')}
        actions={
          <>
            {can('purchases.manage') && (
              <Link to="/purchases/new">
                <Button icon={<Plus className="h-4 w-4" />}>New purchase</Button>
              </Link>
            )}
            {can('suppliers.pay') && (
              <Button variant="primary" icon={<HandCoins className="h-4 w-4" />} onClick={() => setPayOpen(true)}>
                Make payment
              </Button>
            )}
            {can('payments.void') && (
              <Button icon={<Scale className="h-4 w-4" />} onClick={() => setAdjustOpen(true)}>
                Adjust balance
              </Button>
            )}
            {can('suppliers.manage') && (
              <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Payable balance"
          value={money(supplier.balance)}
          tone={supplier.balance > 0 ? 'warn' : 'default'}
          hint={supplier.balance > 0 ? 'We owe the supplier' : supplier.balance < 0 ? 'Advance paid' : 'Settled'}
        />
        <StatCard label="Opening balance" value={money(supplier.openingBalance)} />
        <StatCard label="Supplier since" value={dateLabel(supplier.createdAt)} hint={supplier.address ?? undefined} />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'ledger', label: 'Ledger' },
          { value: 'purchases', label: 'Purchases' },
        ]}
      />
      {tab === 'ledger' ? <LedgerView party="supplier" id={supplierId} /> : <PurchasesTab supplierId={supplierId} />}
      {editOpen && <SupplierFormModal open onClose={() => setEditOpen(false)} supplier={supplier} />}
      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} party="supplier" partyId={supplier.id} partyName={supplier.name} balance={supplier.balance} />
      <BalanceAdjustModal open={adjustOpen} onClose={() => setAdjustOpen(false)} party="supplier" partyId={supplier.id} />
    </div>
  );
}
