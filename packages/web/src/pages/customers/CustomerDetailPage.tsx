import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileSignature, HandCoins, Pencil, Scale } from 'lucide-react';
import { CUSTOMER_TYPE_LABELS, PAYMENT_METHOD_LABELS, type CreditAgreement, type Customer, type Paginated, type Payment, type Sale } from '@pos/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dateLabel, dateTimeLabel, money } from '../../lib/format';
import { Badge, Button, Card, EmptyState, KeyValue, PageHeader, Spinner, StatCard, Tabs, TableWrap } from '../../components/ui';
import { CustomerFormModal } from '../../components/CustomerFormModal';
import { LedgerView } from '../../components/LedgerView';
import { BalanceAdjustModal, PaymentModal } from '../../components/PaymentForm';
import { SendMessageButtons } from '../../components/SendMessage';
import { AgreementFormModal } from '../../components/AgreementFormModal';
import { AgreementRow } from '../AgreementsPage';
import { SaleStatusBadges } from '../sales/SalesPage';
import { BalanceText } from './CustomersPage';

type Tab = 'ledger' | 'sales' | 'payments' | 'agreements';

function SalesTab({ customerId }: { customerId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sales', 'customer', customerId],
    queryFn: () => api.get<Paginated<Sale>>('/sales', { customerId, pageSize: 100 }),
  });
  if (isLoading) return <Spinner />;
  if (!data?.data.length) return <EmptyState title="No sales yet" />;
  return (
    <Card bodyClassName="p-0">
      <TableWrap>
        <table className="table-base">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th className="num">Total</th>
              <th className="num">Paid</th>
              <th className="num">Credit</th>
              <th>Status</th>
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
                <td className="num font-medium">{money(s.grandTotal)}</td>
                <td className="num">{money(s.paidAmount)}</td>
                <td className="num">{s.balanceDue ? money(s.balanceDue) : '—'}</td>
                <td>
                  <SaleStatusBadges sale={s} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

function PaymentsTab({ customerId }: { customerId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['payments', 'customer', customerId],
    queryFn: () => api.get<Paginated<Payment>>('/payments', { customerId, pageSize: 100, includeVoid: true }),
  });
  if (isLoading) return <Spinner />;
  if (!data?.data.length) return <EmptyState title="No payments recorded" />;
  return (
    <Card bodyClassName="p-0">
      <TableWrap>
        <table className="table-base">
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Date</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Against</th>
              <th className="num">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.data.map((p) => (
              <tr key={p.id} className={p.isVoid ? 'opacity-60' : undefined}>
                <td className="font-mono text-xs">{p.paymentNo}</td>
                <td className="whitespace-nowrap text-slate-600">{dateTimeLabel(p.paymentDate)}</td>
                <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                <td className="text-xs text-slate-500">{p.reference ?? '—'}</td>
                <td className="text-sm">{p.saleId ? <Link className="text-brand-700 hover:underline" to={`/sales/${p.saleId}`}>Invoice</Link> : 'Account payment'}</td>
                <td className={`num font-medium ${p.direction === 'out' ? 'text-red-600' : ''}`}>
                  {p.direction === 'out' ? '-' : ''}
                  {money(p.amount)}
                </td>
                <td>{p.isVoid && <Badge color="red">Void</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

function AgreementsTab({ customerId, onNew }: { customerId: number; onNew: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agreements', 'customer', customerId],
    queryFn: () => api.get<Paginated<CreditAgreement>>('/agreements', { customerId, pageSize: 50 }),
  });
  if (isLoading) return <Spinner />;
  return (
    <Card
      bodyClassName="p-0"
      actions={
        <Button size="sm" variant="primary" icon={<FileSignature className="h-4 w-4" />} onClick={onNew}>
          New agreement
        </Button>
      }
    >
      {!data?.data.length ? (
        <EmptyState title="No credit agreements" description="Create a stamp-paper agreement for customers buying on long credit." />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>Agreement</th>
                <th>Date</th>
                <th>Due date</th>
                <th className="num">Amount</th>
                <th className="num">Current balance</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.data.map((a) => (
                <AgreementRow key={a.id} agreement={a} showCustomer={false} />
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number(id);
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('ledger');
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const { data: customer, isLoading } = useQuery({ queryKey: ['customers', 'detail', customerId], queryFn: () => api.get<Customer>(`/customers/${customerId}`) });

  if (isLoading || !customer) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {customer.name}
            <Badge color={customer.priceTier === 'wholesale' ? 'blue' : 'gray'}>{CUSTOMER_TYPE_LABELS[customer.customerType]}</Badge>
            {!customer.isActive && <Badge color="red">Inactive</Badge>}
          </span>
        }
        subtitle={[customer.phone, customer.cnic, customer.address, customer.city].filter(Boolean).join(' · ')}
        actions={
          <>
            {can('customers.receive_payment') && (
              <Button variant="primary" icon={<HandCoins className="h-4 w-4" />} onClick={() => setPayOpen(true)}>
                Receive payment
              </Button>
            )}
            <SendMessageButtons type="reminder" id={customer.id} size="md" />
            {can('agreements.manage') && (
              <Button icon={<FileSignature className="h-4 w-4" />} onClick={() => setAgreementOpen(true)}>
                Agreement
              </Button>
            )}
            {can('payments.void') && (
              <Button icon={<Scale className="h-4 w-4" />} onClick={() => setAdjustOpen(true)}>
                Adjust balance
              </Button>
            )}
            {can('customers.manage') && (
              <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Khata balance" value={<BalanceText balance={customer.balance} />} hint={customer.balance > 0 ? 'Customer owes the shop' : customer.balance < 0 ? 'Advance with the shop' : 'Settled'} />
        <StatCard label="Credit limit" value={customer.creditLimit === null ? 'No limit' : money(customer.creditLimit)} hint={customer.creditLimit !== null ? `Available: ${money(Math.max(0, customer.creditLimit - customer.balance))}` : undefined} />
        <StatCard label="Opening balance" value={money(customer.openingBalance)} hint={`Customer since ${dateLabel(customer.createdAt)}`} />
        <StatCard label="Price level" value={customer.priceTier === 'wholesale' ? 'Wholesale' : 'Retail'} hint={customer.fatherName ? `S/O, D/O, W/O ${customer.fatherName}` : undefined} />
      </div>

      {customer.notes && (
        <Card title="Notes">
          <p className="whitespace-pre-wrap text-sm text-slate-700">{customer.notes}</p>
        </Card>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'ledger', label: 'Khata (ledger)' },
          { value: 'sales', label: 'Sales' },
          { value: 'payments', label: 'Payments' },
          ...(can('agreements.manage') ? [{ value: 'agreements' as Tab, label: 'Agreements' }] : []),
        ]}
      />
      {tab === 'ledger' && <LedgerView party="customer" id={customerId} />}
      {tab === 'sales' && <SalesTab customerId={customerId} />}
      {tab === 'payments' && <PaymentsTab customerId={customerId} />}
      {tab === 'agreements' && <AgreementsTab customerId={customerId} onNew={() => setAgreementOpen(true)} />}

      <CustomerFormModal open={editOpen} onClose={() => setEditOpen(false)} customer={customer} />
      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} party="customer" partyId={customer.id} partyName={customer.name} balance={customer.balance} />
      <BalanceAdjustModal open={adjustOpen} onClose={() => setAdjustOpen(false)} party="customer" partyId={customer.id} />
      <AgreementFormModal open={agreementOpen} onClose={() => setAgreementOpen(false)} customer={customer} />
      {customer.balance > 0 && (
        <Card title="Quick summary for sharing">
          <KeyValue label="Outstanding balance" value={money(customer.balance)} />
          <p className="mt-2 text-xs text-slate-500">Use the WhatsApp / SMS buttons above to send a payment reminder with the current balance.</p>
        </Card>
      )}
    </div>
  );
}
