import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus, Users } from 'lucide-react';
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS, type Customer, type Paginated } from '@pos/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDebounce } from '../../lib/hooks';
import { csvMoney, downloadCsv, money } from '../../lib/format';
import { Badge, Button, Card, Checkbox, EmptyState, PageHeader, Pagination, SearchInput, Select, Spinner, TableWrap } from '../../components/ui';
import { CustomerFormModal } from '../../components/CustomerFormModal';

export function BalanceText({ balance }: { balance: number }) {
  if (balance === 0) return <span className="text-slate-400">—</span>;
  return balance > 0 ? (
    <span className="font-semibold text-red-600">{money(balance)} due</span>
  ) : (
    <span className="font-semibold text-emerald-700">{money(-balance)} advance</span>
  );
}

export function CustomersPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [withBalance, setWithBalance] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [sort, setSort] = useState<'name' | 'balance'>('name');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const debounced = useDebounce(search, 250);
  const params = { search: debounced, type, withBalance: withBalance || undefined, includeInactive: includeInactive || undefined, sort };
  const { data, isLoading } = useQuery({
    queryKey: ['customers', 'list', params, page],
    queryFn: () => api.get<Paginated<Customer>>('/customers', { ...params, page, pageSize: 50 }),
    placeholderData: (prev) => prev,
  });

  const exportCsv = async () => {
    const all = await api.get<Paginated<Customer>>('/customers', { ...params, page: 1, pageSize: 500 });
    downloadCsv('customers.csv', [
      ['Name', 'Father/Husband', 'Phone', 'CNIC', 'Address', 'City', 'Type', 'Price level', 'Credit limit', 'Balance'],
      ...all.data.map((c) => [c.name, c.fatherName, c.phone, c.cnic, c.address, c.city, CUSTOMER_TYPE_LABELS[c.customerType], c.priceTier, csvMoney(c.creditLimit), csvMoney(c.balance)]),
    ]);
  };

  return (
    <div>
      <PageHeader
        title="Customers (Khata)"
        subtitle="Customer records, credit balances, payment history and statements"
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>
              CSV
            </Button>
            {can('customers.manage') && (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                Add customer
              </Button>
            )}
          </>
        }
      />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <SearchInput className="w-full sm:w-72" value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Name, phone, CNIC, city…" />
          <Select className="w-48" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Customer type">
            <option value="">All types</option>
            {CUSTOMER_TYPES.map((t) => (
              <option key={t} value={t}>
                {CUSTOMER_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <Select className="w-44" value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'balance')} aria-label="Sort">
            <option value="name">Sort by name</option>
            <option value="balance">Highest balance first</option>
          </Select>
          <Checkbox checked={withBalance} onChange={(v) => { setWithBalance(v); setPage(1); }} label="With balance only" />
          <Checkbox checked={includeInactive} onChange={(v) => { setIncludeInactive(v); setPage(1); }} label="Show inactive" />
        </div>
        {isLoading ? (
          <Spinner />
        ) : !data?.data.length ? (
          <EmptyState icon={<Users className="h-8 w-8" />} title="No customers found" />
        ) : (
          <>
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>CNIC</th>
                    <th>Type</th>
                    <th>City</th>
                    <th className="num">Credit limit</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((c) => (
                    <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
                      <td>
                        <p className="font-medium text-slate-800">
                          {c.name} {!c.isActive && <Badge>Inactive</Badge>}
                        </p>
                        <p className="text-xs text-slate-500">{c.phone ?? 'No phone'}</p>
                      </td>
                      <td className="text-sm text-slate-600">{c.cnic ?? '—'}</td>
                      <td>
                        <Badge color={c.priceTier === 'wholesale' ? 'blue' : 'gray'}>{CUSTOMER_TYPE_LABELS[c.customerType]}</Badge>
                      </td>
                      <td className="text-slate-600">{c.city ?? '—'}</td>
                      <td className="num text-slate-600">{c.creditLimit === null ? 'No limit' : money(c.creditLimit)}</td>
                      <td className="num">
                        <BalanceText balance={c.balance} />
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
      <CustomerFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={(c) => navigate(`/customers/${c.id}`)} />
    </div>
  );
}
