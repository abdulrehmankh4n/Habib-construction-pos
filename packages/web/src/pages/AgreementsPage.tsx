import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileSignature, Printer } from 'lucide-react';
import type { CreditAgreement, Paginated } from '@pos/shared';
import { api, errorMessage } from '../lib/api';
import { dateLabel, money } from '../lib/format';
import { printUrl } from '../lib/print';
import { Badge, Button, Card, EmptyState, PageHeader, Pagination, Select, Spinner, TableWrap } from '../components/ui';
import { AgreementFormModal } from '../components/AgreementFormModal';

export function AgreementRow({ agreement, showCustomer = true }: { agreement: CreditAgreement; showCustomer?: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const status = useMutation({
    mutationFn: (s: 'settled' | 'cancelled' | 'active') => api.post(`/agreements/${agreement.id}/status`, { status: s }),
    onSuccess: () => {
      toast.success('Agreement updated');
      qc.invalidateQueries({ queryKey: ['agreements'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <tr className={agreement.status !== 'active' ? 'opacity-70' : undefined}>
      <td className="font-mono text-xs">{agreement.agreementNo}</td>
      {showCustomer && (
        <td>
          <Link to={`/customers/${agreement.customerId}`} className="font-medium text-brand-700 hover:underline">
            {agreement.customerName}
          </Link>
          <p className="text-xs text-slate-500">{agreement.cnic}</p>
        </td>
      )}
      <td className="text-slate-600">{dateLabel(agreement.agreementDate)}</td>
      <td className={agreement.isOverdue ? 'font-medium text-red-600' : 'text-slate-600'}>{dateLabel(agreement.dueDate)}</td>
      <td className="num font-medium">{money(agreement.amount)}</td>
      <td className="num">{money(agreement.currentBalance ?? 0)}</td>
      <td>
        {agreement.status === 'settled' ? (
          <Badge color="green">Settled</Badge>
        ) : agreement.status === 'cancelled' ? (
          <Badge color="gray">Cancelled</Badge>
        ) : agreement.isOverdue ? (
          <Badge color="red">Overdue</Badge>
        ) : (
          <Badge color="blue">Active</Badge>
        )}
        {agreement.installments > 1 && <span className="ml-1 text-xs text-slate-500">{agreement.installments} instalments</span>}
      </td>
      <td>
        <div className="flex justify-end gap-1">
          <Button size="xs" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => printUrl(`/print/agreement/${agreement.id}`)}>
            Print
          </Button>
          {agreement.status === 'active' && (
            <>
              <Button size="xs" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button size="xs" variant="success" loading={status.isPending} onClick={() => status.mutate('settled')}>
                Settled
              </Button>
            </>
          )}
        </div>
        {editing && <AgreementFormModal open onClose={() => setEditing(false)} agreement={agreement} />}
      </td>
    </tr>
  );
}

export function AgreementsPage() {
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['agreements', status, page],
    queryFn: () => api.get<Paginated<CreditAgreement>>('/agreements', { status, page, pageSize: 50 }),
  });
  const overdue = (data?.data ?? []).filter((a) => a.isOverdue);

  return (
    <div>
      <PageHeader
        title="Credit Agreements"
        subtitle="Printable stamp-paper agreements for customers buying on credit, with due dates and recovery tracking"
        actions={
          <Button variant="primary" icon={<FileSignature className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
            New agreement
          </Button>
        }
      />
      {overdue.length > 0 && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {overdue.length} agreement(s) are past their due date with an outstanding balance — total {money(overdue.reduce((s, a) => s + (a.currentBalance ?? 0), 0))}.
        </div>
      )}
      <Card
        bodyClassName="p-0"
        actions={
          <Select className="w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="settled">Settled</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        }
      >
        {isLoading ? (
          <Spinner />
        ) : !data?.data.length ? (
          <EmptyState
            icon={<FileSignature className="h-8 w-8" />}
            title="No agreements"
            description="Create an agreement when a customer takes material on long credit. It prints on Pakistani legal/stamp paper with CNIC, amount, due date and witnesses."
          />
        ) : (
          <>
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Agreement</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Due date</th>
                    <th className="num">Agreed amount</th>
                    <th className="num">Current balance</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((a) => (
                    <AgreementRow key={a.id} agreement={a} />
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <Pagination page={page} pageSize={50} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
      <AgreementFormModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
