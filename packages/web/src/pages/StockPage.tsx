import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import {
  ADJUSTMENT_REASONS,
  STOCK_MOVEMENT_LABELS,
  STOCK_MOVEMENT_TYPES,
  type Paginated,
  type Product,
  type StockAdjustment,
  type StockMovement,
} from '@pos/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTimeLabel, downloadCsv, money, monthStart, qty, today } from '../lib/format';
import { Badge, Button, Card, DateRange, EmptyState, Field, Input, Modal, PageHeader, Pagination, QtyInput, Select, Spinner, Tabs, TableWrap } from '../components/ui';
import { ProductPicker } from '../components/pickers';

type Tab = 'adjustments' | 'movements' | 'low';

function AdjustModal({ open, onClose, initialProductId }: { open: boolean; onClose: () => void; initialProductId: number | null }) {
  const qc = useQueryClient();
  const [product, setProduct] = useState<Product | null>(null);
  const [mode, setMode] = useState<'in' | 'out' | 'set'>('out');
  const [value, setValue] = useState<number | null>(null);
  const [reason, setReason] = useState<string>(ADJUSTMENT_REASONS[0]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setValue(null);
    setNote('');
    if (initialProductId) api.get<Product>(`/products/${initialProductId}`).then(setProduct).catch(() => undefined);
  }, [open, initialProductId]);

  const after =
    product && value !== null ? (mode === 'set' ? value : mode === 'in' ? product.stockQty + value : product.stockQty - value) : null;

  const save = useMutation({
    mutationFn: () => api.post<{ adjustmentNo: string; stockQty: number }>('/inventory/adjustments', { productId: product!.id, mode, qty: value, reason, note: note || null }),
    onSuccess: (r) => {
      toast.success(`${r.adjustmentNo}: stock is now ${qty(r.stockQty, product?.unitSymbol)}`);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setProduct(null);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Stock adjustment"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!product || value === null} loading={save.isPending} onClick={() => save.mutate()}>
            Save adjustment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Product" required>
          <ProductPicker value={product} onChange={setProduct} autoFocus={!initialProductId} />
        </Field>
        {product && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            Current stock: <span className="font-semibold">{qty(product.stockQty, product.unitSymbol)}</span>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Adjustment type">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'in' | 'out' | 'set')}>
              <option value="out">Remove stock (damage, wastage…)</option>
              <option value="in">Add stock (found, correction…)</option>
              <option value="set">Set to physical count</option>
            </Select>
          </Field>
          <Field label={mode === 'set' ? `Counted quantity (${product?.unitSymbol ?? ''})` : `Quantity (${product?.unitSymbol ?? ''})`} required>
            <QtyInput value={value} allowDecimal={product?.allowDecimal ?? true} onChange={setValue} />
          </Field>
          <Field label="Reason" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional details" />
          </Field>
        </div>
        {after !== null && (
          <p className={`text-sm ${after < 0 ? 'text-red-600' : 'text-slate-600'}`}>
            Stock after adjustment: <span className="font-semibold">{qty(after, product?.unitSymbol)}</span>
          </p>
        )}
      </div>
    </Modal>
  );
}

function AdjustmentsTab({ onNew }: { onNew: () => void }) {
  const { can } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'adjustments', from, to, page],
    queryFn: () => api.get<Paginated<StockAdjustment>>('/inventory/adjustments', { from, to, page, pageSize: 50 }),
  });
  return (
    <Card
      bodyClassName="p-0"
      title={<DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />}
      actions={
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={onNew}>
          New adjustment
        </Button>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : !data?.data.length ? (
        <EmptyState title="No adjustments in this period" description="Record breakage, wastage or physical count corrections." />
      ) : (
        <>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Date</th>
                  <th>Product</th>
                  <th className="num">Change</th>
                  <th>Reason</th>
                  <th>Note</th>
                  {can('products.view_cost') && <th className="num">Value</th>}
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((a) => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs">{a.adjustmentNo}</td>
                    <td className="whitespace-nowrap text-slate-600">{dateTimeLabel(a.createdAt)}</td>
                    <td>
                      <Link to={`/products/${a.productId}`} className="hover:underline">
                        {a.productName}
                      </Link>
                    </td>
                    <td className={`num font-medium ${a.adjustmentType === 'out' ? 'text-red-600' : 'text-emerald-700'}`}>
                      {a.adjustmentType === 'out' ? '-' : '+'}
                      {qty(a.qty, a.unitSymbol)}
                    </td>
                    <td>{a.reason}</td>
                    <td className="max-w-xs truncate text-slate-500">{a.note}</td>
                    {can('products.view_cost') && <td className="num text-slate-600">{a.unitCost !== undefined ? money(Math.round(a.qty * a.unitCost)) : ''}</td>}
                    <td className="text-slate-600">{a.createdByName}</td>
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

function MovementsTab() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'movements', from, to, type, page],
    queryFn: () => api.get<Paginated<StockMovement>>('/inventory/movements', { from, to, type, page, pageSize: 100 }),
  });
  return (
    <Card
      bodyClassName="p-0"
      title={<DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />}
      actions={
        <Select className="w-44" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Movement type">
          <option value="">All movements</option>
          {STOCK_MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {STOCK_MOVEMENT_LABELS[t]}
            </option>
          ))}
        </Select>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : !data?.data.length ? (
        <EmptyState title="No stock movements" />
      ) : (
        <>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th className="num">Change</th>
                  <th className="num">Balance</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-slate-600">{dateTimeLabel(m.createdAt)}</td>
                    <td>
                      <Link to={`/products/${m.productId}`} className="hover:underline">
                        {m.productName}
                      </Link>
                    </td>
                    <td>{STOCK_MOVEMENT_LABELS[m.movementType]}</td>
                    <td className="text-xs">{m.referenceNo ?? '—'}</td>
                    <td className={`num font-medium ${m.qtyChange < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {m.qtyChange > 0 ? '+' : ''}
                      {qty(m.qtyChange)}
                    </td>
                    <td className="num">{qty(m.balanceAfter)}</td>
                    <td className="text-xs text-slate-500">{m.createdByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pagination page={page} pageSize={100} total={data.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

interface LowRow {
  productId: number;
  sku: string;
  productName: string;
  categoryName: string;
  unitSymbol: string;
  qty: number;
  minStock: number;
  supplierName: string | null;
  supplierPhone: string | null;
}

function LowStockTab() {
  const { data, isLoading } = useQuery({ queryKey: ['reports', 'low-stock'], queryFn: () => api.get<{ rows: LowRow[] }>('/reports/low-stock') });
  if (isLoading) return <Spinner />;
  const rows = data?.rows ?? [];
  return (
    <Card
      title={`${rows.length} product(s) at or below minimum stock`}
      bodyClassName="p-0"
      actions={
        <Button
          size="sm"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv('reorder-list.csv', [
              ['SKU', 'Product', 'Category', 'Stock', 'Minimum', 'Suggested order', 'Unit', 'Supplier', 'Supplier phone'],
              ...rows.map((r) => [r.sku, r.productName, r.categoryName, r.qty, r.minStock, Math.max(0, r.minStock * 2 - r.qty), r.unitSymbol, r.supplierName, r.supplierPhone]),
            ])
          }
        >
          Export reorder list
        </Button>
      }
    >
      {!rows.length ? (
        <EmptyState title="All products are above minimum stock" />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th className="num">In stock</th>
                <th className="num">Minimum</th>
                <th>Supplier</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId}>
                  <td>
                    <Link to={`/products/${r.productId}`} className="font-medium hover:underline">
                      {r.productName}
                    </Link>
                    <p className="text-xs text-slate-500">{r.sku}</p>
                  </td>
                  <td>{r.categoryName}</td>
                  <td className="num font-semibold text-red-600">{qty(r.qty, r.unitSymbol)}</td>
                  <td className="num">{qty(r.minStock, r.unitSymbol)}</td>
                  <td className="text-sm">
                    {r.supplierName ?? '—'}
                    {r.supplierPhone && <p className="text-xs text-slate-500">{r.supplierPhone}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

export function StockPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'adjustments');
  const initialProduct = Number(params.get('product')) || null;
  const [adjustOpen, setAdjustOpen] = useState(!!initialProduct);

  return (
    <div>
      <PageHeader
        title="Stock Control"
        subtitle="Adjustments, breakage & wastage, physical counts, movement ledger and reorder list"
        actions={<Badge color="gray">Stock updates instantly on every counter</Badge>}
      />
      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          setParams({}, { replace: true });
        }}
        tabs={[
          { value: 'adjustments', label: 'Adjustments' },
          { value: 'movements', label: 'Stock ledger' },
          { value: 'low', label: 'Low stock / reorder' },
        ]}
      />
      {tab === 'adjustments' && <AdjustmentsTab onNew={() => setAdjustOpen(true)} />}
      {tab === 'movements' && <MovementsTab />}
      {tab === 'low' && <LowStockTab />}
      <AdjustModal open={adjustOpen} onClose={() => setAdjustOpen(false)} initialProductId={initialProduct} />
    </div>
  );
}
