import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Banknote, Plus, Settings2, XCircle } from 'lucide-react';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type Expense, type ExpenseCategory, type PaymentMethod } from '@pos/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { csvMoney, dateLabel, downloadCsv, money, monthStart, today } from '../lib/format';
import { Badge, Button, Card, ConfirmDialog, DateRange, EmptyState, Field, Input, Modal, MoneyInput, PageHeader, Pagination, Select, Spinner, StatCard, TableWrap, Textarea } from '../components/ui';

function ExpenseModal({ categories, onClose }: { categories: ExpenseCategory[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    expenseDate: today(),
    categoryId: categories[0]?.id ?? 0,
    amount: null as number | null,
    method: 'cash' as PaymentMethod,
    paidTo: '',
    reference: '',
    notes: '',
  });
  const save = useMutation({
    mutationFn: () => api.post('/expenses', { ...form, paidTo: form.paidTo || null, reference: form.reference || null, notes: form.notes || null }),
    onSuccess: () => {
      toast.success('Expense recorded');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cashbook'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Record expense"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!form.amount || !form.categoryId} loading={save.isPending} onClick={() => save.mutate()}>
            Save expense
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" required>
          <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}>
            {categories.filter((c) => c.isActive).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" required>
          <MoneyInput autoFocus value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
        </Field>
        <Field label="Date">
          <Input type="date" value={form.expenseDate} max={today()} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
        </Field>
        <Field label="Paid by">
          <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid to">
          <Input value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} placeholder="Person / company" />
        </Field>
        <Field label="Reference">
          <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function CategoriesModal({ categories, onClose }: { categories: ExpenseCategory[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => api.post('/expenses/categories', { name, isActive: true }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['expenses', 'categories'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: (c: ExpenseCategory) => api.put(`/expenses/categories/${c.id}`, { name: c.name, isActive: !c.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'categories'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title="Expense categories" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="mb-3 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
        <Button variant="primary" disabled={!name.trim()} loading={add.isPending} onClick={() => add.mutate()}>
          Add
        </Button>
      </div>
      <ul className="divide-y divide-slate-100">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            <span className={c.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}>{c.name}</span>
            <Button size="xs" onClick={() => toggle.mutate(c)}>
              {c.isActive ? 'Disable' : 'Enable'}
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function ExpensesPage() {
  const { can } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const qc = useQueryClient();

  const categories = useQuery({ queryKey: ['expenses', 'categories'], queryFn: () => api.get<ExpenseCategory[]>('/expenses/categories') });
  const { data, isLoading } = useQuery({
    queryKey: ['expenses', 'list', from, to, categoryId, page],
    queryFn: () => api.get<{ data: Expense[]; total: number; summary: { amount: number } }>('/expenses', { from, to, categoryId, page, pageSize: 50 }),
    placeholderData: (prev) => prev,
  });
  const voidExpense = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => api.post(`/expenses/${id}/void`, { reason }),
    onSuccess: () => {
      toast.success('Expense cancelled');
      setVoiding(null);
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cashbook'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Shop running costs — rent, bills, wages, labour, fuel and more"
        actions={
          <>
            {can('expenses.manage') && (
              <Button icon={<Settings2 className="h-4 w-4" />} onClick={() => setCatsOpen(true)}>
                Categories
              </Button>
            )}
            {can('expenses.manage') && (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                Add expense
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Expenses in period" value={money(data?.summary.amount ?? 0)} hint={`${dateLabel(from)} to ${dateLabel(to)}`} />
        <StatCard label="Entries" value={data?.total ?? 0} />
        <StatCard label="Categories" value={categories.data?.filter((c) => c.isActive).length ?? 0} />
      </div>
      <Card
        bodyClassName="p-0"
        title={<DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />}
        actions={
          <>
            <Select className="w-48" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} aria-label="Category">
              <option value="">All categories</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              disabled={!data?.data.length}
              onClick={() =>
                downloadCsv(`expenses-${from}-to-${to}.csv`, [
                  ['No.', 'Date', 'Category', 'Amount', 'Method', 'Paid to', 'Reference', 'Notes', 'By'],
                  ...(data?.data ?? []).map((e) => [e.expenseNo, e.expenseDate, e.categoryName, csvMoney(e.amount), e.method, e.paidTo, e.reference, e.notes, e.createdByName]),
                ])
              }
            >
              CSV
            </Button>
          </>
        }
      >
        {isLoading ? (
          <Spinner />
        ) : !data?.data.length ? (
          <EmptyState icon={<Banknote className="h-8 w-8" />} title="No expenses in this period" />
        ) : (
          <>
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Paid to</th>
                    <th>Method</th>
                    <th className="num">Amount</th>
                    <th>By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((e) => (
                    <tr key={e.id} className={e.isVoid ? 'opacity-60' : undefined}>
                      <td className="font-mono text-xs">{e.expenseNo}</td>
                      <td className="whitespace-nowrap text-slate-600">{dateLabel(e.expenseDate)}</td>
                      <td>{e.categoryName}</td>
                      <td className="text-slate-600">{e.paidTo ?? '—'}</td>
                      <td>{PAYMENT_METHOD_LABELS[e.method]}</td>
                      <td className="num font-medium">{money(e.amount)}</td>
                      <td className="text-slate-600">{e.createdByName}</td>
                      <td>
                        {e.isVoid ? (
                          <Badge color="red">Cancelled</Badge>
                        ) : (
                          can('expenses.manage') && (
                            <Button size="xs" variant="ghost" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setVoiding(e)}>
                              Cancel
                            </Button>
                          )
                        )}
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
      {addOpen && categories.data && <ExpenseModal categories={categories.data} onClose={() => setAddOpen(false)} />}
      {catsOpen && categories.data && <CategoriesModal categories={categories.data} onClose={() => setCatsOpen(false)} />}
      <ConfirmDialog
        open={!!voiding}
        title={`Cancel expense ${voiding?.expenseNo}?`}
        message="The amount will be removed from the cash book and reports."
        confirmLabel="Cancel expense"
        danger
        requireReason
        loading={voidExpense.isPending}
        onClose={() => setVoiding(null)}
        onConfirm={(reason) => voiding && voidExpense.mutate({ id: voiding.id, reason })}
      />
    </div>
  );
}
