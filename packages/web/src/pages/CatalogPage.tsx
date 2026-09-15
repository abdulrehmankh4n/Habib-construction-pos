import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Brand, Category, Subcategory, TaxRate, Unit } from '@pos/shared';
import { api, errorMessage } from '../lib/api';
import { Badge, Button, Card, Checkbox, ConfirmDialog, Field, Input, Modal, PageHeader, Select, Spinner, Tabs, TableWrap, Textarea } from '../components/ui';

type Tab = 'categories' | 'brands' | 'units' | 'tax';

function useCatalogMutation<T>(fn: (v: T) => Promise<unknown>, success: string, onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(success);
      qc.invalidateQueries({ queryKey: ['catalog'] });
      onDone?.();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

function CategoryModal({ category, onClose }: { category: Partial<Category> | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: category?.name ?? '',
    description: category?.description ?? '',
    sortOrder: category?.sortOrder ?? 0,
    isActive: category?.isActive ?? true,
  });
  const save = useCatalogMutation(
    () => (category?.id ? api.put(`/catalog/categories/${category.id}`, form) : api.post('/catalog/categories', form)),
    'Category saved',
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={category?.id ? 'Edit category' : 'New category'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate(undefined)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Display order">
          <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
        </Field>
        <Checkbox checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Active" />
      </div>
    </Modal>
  );
}

function SubcategoryModal({ sub, categories, onClose }: { sub: Partial<Subcategory> & { categoryId: number }; categories: Category[]; onClose: () => void }) {
  const [form, setForm] = useState({ categoryId: sub.categoryId, name: sub.name ?? '', sortOrder: sub.sortOrder ?? 0, isActive: sub.isActive ?? true });
  const save = useCatalogMutation(
    () => (sub.id ? api.put(`/catalog/subcategories/${sub.id}`, form) : api.post('/catalog/subcategories', form)),
    'Subcategory saved',
    onClose,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={sub.id ? 'Edit subcategory' : 'New subcategory'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate(undefined)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Category">
          <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" required>
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Display order">
          <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
        </Field>
        <Checkbox checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Active" />
      </div>
    </Modal>
  );
}

function CategoriesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['catalog', 'categories', 'all'],
    queryFn: () => api.get<Category[]>('/catalog/categories', { includeInactive: true }),
  });
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null);
  const [editSub, setEditSub] = useState<(Partial<Subcategory> & { categoryId: number }) | null>(null);
  const [deleting, setDeleting] = useState<{ type: 'category' | 'subcategory'; id: number; name: string } | null>(null);
  const del = useCatalogMutation(
    (d: { type: string; id: number }) => api.del(`/catalog/${d.type === 'category' ? 'categories' : 'subcategories'}/${d.id}`),
    'Deleted',
    () => setDeleting(null),
  );

  if (isLoading || !data) return <Spinner />;
  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Card
      title={`${data.length} categories · ${data.reduce((s, c) => s + c.subcategories.length, 0)} subcategories`}
      actions={
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditCat({})}>
          Category
        </Button>
      }
      bodyClassName="p-0"
    >
      <ul className="divide-y divide-slate-100">
        {data.map((c) => (
          <li key={c.id}>
            <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50">
              <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => toggle(c.id)}>
                {open.has(c.id) ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="font-medium text-slate-800">{c.name}</span>
                <span className="text-xs text-slate-500">
                  {c.subcategories.length} sub · {c.productCount} products
                </span>
                {!c.isActive && <Badge>Inactive</Badge>}
              </button>
              <Button size="xs" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditSub({ categoryId: c.id })}>
                Sub
              </Button>
              <Button size="xs" variant="ghost" aria-label="Edit category" onClick={() => setEditCat(c)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="xs" variant="ghost" aria-label="Delete category" onClick={() => setDeleting({ type: 'category', id: c.id, name: c.name })}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {open.has(c.id) && (
              <ul className="bg-slate-50/60 pb-2">
                {c.subcategories.length === 0 && <li className="px-12 py-2 text-sm text-slate-500">No subcategories</li>}
                {c.subcategories.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-1.5 pl-12 pr-4 text-sm">
                    <span className="flex-1 text-slate-700">
                      {s.name} <span className="text-xs text-slate-400">({s.productCount})</span> {!s.isActive && <Badge>Inactive</Badge>}
                    </span>
                    <Button size="xs" variant="ghost" aria-label="Edit subcategory" onClick={() => setEditSub(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="xs" variant="ghost" aria-label="Delete subcategory" onClick={() => setDeleting({ type: 'subcategory', id: s.id, name: s.name })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {editCat && <CategoryModal category={editCat} onClose={() => setEditCat(null)} />}
      {editSub && <SubcategoryModal sub={editSub} categories={data} onClose={() => setEditSub(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name}?`}
        message="Only possible when no products use it. Otherwise deactivate it instead."
        danger
        confirmLabel="Delete"
        loading={del.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting)}
      />
    </Card>
  );
}

function SimpleList<T extends { id: number; isActive: boolean }>({
  title,
  queryKey,
  endpoint,
  columns,
  empty,
  renderForm,
}: {
  title: string;
  queryKey: string;
  endpoint: string;
  columns: { label: string; render: (row: T) => ReactNode; className?: string }[];
  empty: Record<string, unknown>;
  renderForm: (form: Record<string, unknown>, set: (patch: Record<string, unknown>) => void) => ReactNode;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['catalog', queryKey, 'all'],
    queryFn: () => api.get<T[]>(`/catalog/${endpoint}`, { includeInactive: true }),
  });
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const save = useCatalogMutation(
    (form: Record<string, unknown>) => (form.id ? api.put(`/catalog/${endpoint}/${form.id}`, form) : api.post(`/catalog/${endpoint}`, form)),
    'Saved',
    () => setEditing(null),
  );
  const del = useCatalogMutation((id: number) => api.del(`/catalog/${endpoint}/${id}`), 'Deleted', () => setDeleting(null));

  return (
    <Card
      title={title}
      bodyClassName="p-0"
      actions={
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ ...empty })}>
          Add
        </Button>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label} className={c.className}>
                    {c.label}
                  </th>
                ))}
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.label} className={c.className}>
                      {c.render(row)}
                    </td>
                  ))}
                  <td>{row.isActive ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button size="xs" variant="ghost" aria-label="Edit" onClick={() => setEditing({ ...(row as unknown as Record<string, unknown>) })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="xs" variant="ghost" aria-label="Delete" onClick={() => setDeleting(row)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? `Edit ${title.toLowerCase()}` : `Add ${title.toLowerCase()}`}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(editing)}>
                Save
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {renderForm(editing, (patch) => setEditing((f) => ({ ...(f ?? {}), ...patch })))}
            <Checkbox checked={!!editing.isActive} onChange={(v) => setEditing((f) => ({ ...(f ?? {}), isActive: v }))} label="Active" />
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Delete this record?"
        message="Only possible if nothing uses it. Otherwise deactivate it."
        danger
        confirmLabel="Delete"
        loading={del.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </Card>
  );
}

export function CatalogPage() {
  const [tab, setTab] = useState<Tab>('categories');
  return (
    <div>
      <PageHeader title="Categories & Units" subtitle="Organise products as Category → Subcategory → Product; manage brands, units and GST rates" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'categories', label: 'Categories' },
          { value: 'brands', label: 'Brands' },
          { value: 'units', label: 'Units of measure' },
          { value: 'tax', label: 'Tax rates' },
        ]}
      />
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'brands' && (
        <SimpleList<Brand>
          title="Brand"
          queryKey="brands"
          endpoint="brands"
          empty={{ name: '', isActive: true }}
          columns={[
            { label: 'Brand', render: (b) => <span className="font-medium">{b.name}</span> },
            { label: 'Products', render: (b) => b.productCount, className: 'num' },
          ]}
          renderForm={(f, set) => (
            <Field label="Brand name" required>
              <Input autoFocus value={String(f.name ?? '')} onChange={(e) => set({ name: e.target.value })} />
            </Field>
          )}
        />
      )}
      {tab === 'units' && (
        <SimpleList<Unit>
          title="Unit"
          queryKey="units"
          endpoint="units"
          empty={{ name: '', symbol: '', allowDecimal: false, isActive: true }}
          columns={[
            { label: 'Unit', render: (u) => <span className="font-medium">{u.name}</span> },
            { label: 'Symbol', render: (u) => <code className="text-xs">{u.symbol}</code> },
            { label: 'Fractions', render: (u) => (u.allowDecimal ? 'Allowed (e.g. 12.5)' : 'Whole numbers') },
          ]}
          renderForm={(f, set) => (
            <>
              <Field label="Unit name" required>
                <Input autoFocus value={String(f.name ?? '')} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Trolley" />
              </Field>
              <Field label="Symbol" required hint="Short code shown on receipts">
                <Input value={String(f.symbol ?? '')} onChange={(e) => set({ symbol: e.target.value })} placeholder="e.g. trolley" />
              </Field>
              <Checkbox checked={!!f.allowDecimal} onChange={(v) => set({ allowDecimal: v })} label="Allow fractional quantities" description="e.g. 12.5 KG or 0.5 trolley" />
            </>
          )}
        />
      )}
      {tab === 'tax' && (
        <SimpleList<TaxRate>
          title="Tax rate"
          queryKey="tax-rates"
          endpoint="tax-rates"
          empty={{ name: '', rate: 18, isDefault: false, isActive: true }}
          columns={[
            { label: 'Name', render: (t) => <span className="font-medium">{t.name}</span> },
            { label: 'Rate', render: (t) => `${t.rate}%`, className: 'num' },
            { label: 'Default', render: (t) => (t.isDefault ? <Badge color="brand">Default</Badge> : null) },
          ]}
          renderForm={(f, set) => (
            <>
              <Field label="Name" required>
                <Input autoFocus value={String(f.name ?? '')} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. GST 18%" />
              </Field>
              <Field label="Rate (%)" required>
                <Input type="number" step="0.01" min={0} max={100} value={String(f.rate ?? 0)} onChange={(e) => set({ rate: Number(e.target.value) })} />
              </Field>
              <Checkbox checked={!!f.isDefault} onChange={(v) => set({ isDefault: v })} label="Default for new products" />
            </>
          )}
        />
      )}
    </div>
  );
}
