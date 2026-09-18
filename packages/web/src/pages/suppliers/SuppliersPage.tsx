import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Factory, Plus } from 'lucide-react';
import type { Paginated, Supplier } from '@pos/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDebounce } from '../../lib/hooks';
import { money } from '../../lib/format';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, MoneyInput, PageHeader, Pagination, SearchInput, Spinner, TableWrap, Textarea } from '../../components/ui';

interface SupplierForm {
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  ntn: string;
  strn: string;
  openingBalance: number | null;
  notes: string;
  isActive: boolean;
}

const blank: SupplierForm = { name: '', company: '', phone: '', email: '', address: '', city: '', ntn: '', strn: '', openingBalance: 0, notes: '', isActive: true };

export function SupplierFormModal({ open, onClose, supplier, onSaved }: { open: boolean; onClose: () => void; supplier?: Supplier | null; onSaved?: (s: Supplier) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SupplierForm>(
    supplier
      ? {
          name: supplier.name,
          company: supplier.company ?? '',
          phone: supplier.phone ?? '',
          email: supplier.email ?? '',
          address: supplier.address ?? '',
          city: supplier.city ?? '',
          ntn: supplier.ntn ?? '',
          strn: supplier.strn ?? '',
          openingBalance: supplier.openingBalance,
          notes: supplier.notes ?? '',
          isActive: supplier.isActive,
        }
      : blank,
  );
  const set = <K extends keyof SupplierForm>(k: K, v: SupplierForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, email: form.email || null, openingBalance: form.openingBalance ?? 0 };
      return supplier ? api.put<Supplier>(`/suppliers/${supplier.id}`, body) : api.post<Supplier>('/suppliers', body);
    },
    onSuccess: (s) => {
      toast.success(supplier ? 'Supplier updated' : 'Supplier added');
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      onSaved?.(s);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={supplier ? `Edit supplier — ${supplier.name}` : 'New supplier'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!form.name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier name" required>
          <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Al-Madina Cement Traders" />
        </Field>
        <Field label="Company / business">
          <Input value={form.company} onChange={(e) => set('company', e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0300-1234567" />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="NTN">
          <Input value={form.ntn} onChange={(e) => set('ntn', e.target.value)} />
        </Field>
        <Field label="STRN">
          <Input value={form.strn} onChange={(e) => set('strn', e.target.value)} />
        </Field>
        <Field label="Opening balance (payable)" hint="Amount already owed to this supplier">
          <MoneyInput value={form.openingBalance} onChange={(v) => set('openingBalance', v)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {supplier && (
          <div className="sm:col-span-2">
            <Checkbox checked={form.isActive} onChange={(v) => set('isActive', v)} label="Active" />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function SuppliersPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [withBalance, setWithBalance] = useState(false);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const debounced = useDebounce(search, 250);
  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', 'list', debounced, withBalance, page],
    queryFn: () => api.get<Paginated<Supplier>>('/suppliers', { search: debounced, withBalance: withBalance || undefined, page, pageSize: 50 }),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Cement, steel, sand and hardware suppliers with payable balances"
        actions={
          can('suppliers.manage') && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Add supplier
            </Button>
          )
        }
      />
      <Card
        bodyClassName="p-0"
        actions={
          <>
            <SearchInput className="w-64" value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Name, company, phone…" />
            <Checkbox checked={withBalance} onChange={(v) => { setWithBalance(v); setPage(1); }} label="With balance only" />
          </>
        }
      >
        {isLoading ? (
          <Spinner />
        ) : !data?.data.length ? (
          <EmptyState icon={<Factory className="h-8 w-8" />} title="No suppliers yet" />
        ) : (
          <>
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Company</th>
                    <th>City</th>
                    <th>NTN</th>
                    <th className="num">Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((s) => (
                    <tr key={s.id} className="cursor-pointer" onClick={() => navigate(`/suppliers/${s.id}`)}>
                      <td>
                        <p className="font-medium text-slate-800">
                          {s.name} {!s.isActive && <Badge>Inactive</Badge>}
                        </p>
                        <p className="text-xs text-slate-500">{s.phone ?? '—'}</p>
                      </td>
                      <td className="text-slate-600">{s.company ?? '—'}</td>
                      <td className="text-slate-600">{s.city ?? '—'}</td>
                      <td className="text-slate-600">{s.ntn ?? '—'}</td>
                      <td className="num">
                        {s.balance === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : s.balance > 0 ? (
                          <span className="font-semibold text-amber-700">{money(s.balance)}</span>
                        ) : (
                          <span className="font-semibold text-emerald-700">{money(-s.balance)} advance</span>
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
      {createOpen && <SupplierFormModal open onClose={() => setCreateOpen(false)} onSaved={(s) => navigate(`/suppliers/${s.id}`)} />}
    </div>
  );
}
