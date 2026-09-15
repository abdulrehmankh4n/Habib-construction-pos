import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import {
  STOCK_MOVEMENT_LABELS,
  type Brand,
  type Category,
  type Paginated,
  type Product,
  type StockMovement,
  type Supplier,
  type TaxRate,
  type Unit,
} from '@pos/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { resizeImage } from '../../lib/image';
import { dateTimeLabel, money, qty } from '../../lib/format';
import { Badge, Button, Card, Checkbox, Field, Input, MoneyInput, PageHeader, Pagination, QtyInput, Select, Spinner, TableWrap, Textarea } from '../../components/ui';
import { ProductThumb } from '../../components/pickers';

interface UnitRow {
  unitId: number | '';
  factor: number | null;
  salePrice: number | null;
  wholesalePrice: number | null;
  barcode: string;
}

interface FormState {
  name: string;
  urduName: string;
  categoryId: number | '';
  subcategoryId: number | '';
  brandId: number | '';
  specification: string;
  size: string;
  sku: string;
  barcode: string;
  unitId: number | '';
  purchasePrice: number | null;
  salePrice: number | null;
  wholesalePrice: number | null;
  minSalePrice: number | null;
  taxRateId: number | '';
  hsCode: string;
  openingStock: number | null;
  minStock: number | null;
  supplierId: number | '';
  location: string;
  trackStock: boolean;
  notes: string;
  isActive: boolean;
  units: UnitRow[];
}

const blank: FormState = {
  name: '',
  urduName: '',
  categoryId: '',
  subcategoryId: '',
  brandId: '',
  specification: '',
  size: '',
  sku: '',
  barcode: '',
  unitId: '',
  purchasePrice: 0,
  salePrice: null,
  wholesalePrice: null,
  minSalePrice: null,
  taxRateId: '',
  hsCode: '',
  openingStock: 0,
  minStock: 0,
  supplierId: '',
  location: '',
  trackStock: true,
  notes: '',
  isActive: true,
  units: [],
};

function fromProduct(p: Product): FormState {
  return {
    name: p.name,
    urduName: p.urduName ?? '',
    categoryId: p.categoryId,
    subcategoryId: p.subcategoryId ?? '',
    brandId: p.brandId ?? '',
    specification: p.specification ?? '',
    size: p.size ?? '',
    sku: p.sku,
    barcode: p.barcode ?? '',
    unitId: p.unitId,
    purchasePrice: p.purchasePrice ?? 0,
    salePrice: p.salePrice,
    wholesalePrice: p.wholesalePrice,
    minSalePrice: p.minSalePrice,
    taxRateId: p.taxRateId,
    hsCode: p.hsCode ?? '',
    openingStock: 0,
    minStock: p.minStock,
    supplierId: p.supplierId ?? '',
    location: p.location ?? '',
    trackStock: p.trackStock,
    notes: p.notes ?? '',
    isActive: p.isActive,
    units: p.units.map((u) => ({ unitId: u.unitId, factor: u.factor, salePrice: u.salePrice, wholesalePrice: u.wholesalePrice, barcode: u.barcode ?? '' })),
  };
}

function Movements({ productId, unitSymbol }: { productId: number; unitSymbol: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['products', productId, 'movements', page],
    queryFn: () => api.get<Paginated<StockMovement>>(`/products/${productId}/movements`, { page, pageSize: 20 }),
  });
  if (isLoading) return <Spinner />;
  if (!data?.data.length) return <p className="px-4 py-3 text-sm text-slate-500">No stock movements yet.</p>;
  return (
    <>
      <TableWrap>
        <table className="table-base">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Reference</th>
              <th className="num">In / Out</th>
              <th className="num">Balance</th>
              <th>Note</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-slate-600">{dateTimeLabel(m.createdAt)}</td>
                <td>{STOCK_MOVEMENT_LABELS[m.movementType]}</td>
                <td>
                  {m.referenceType === 'sale' && m.referenceId ? (
                    <Link className="text-brand-700 hover:underline" to={`/sales/${m.referenceId}`}>
                      {m.referenceNo}
                    </Link>
                  ) : m.referenceType === 'purchase' && m.referenceId ? (
                    <Link className="text-brand-700 hover:underline" to={`/purchases/${m.referenceId}`}>
                      {m.referenceNo}
                    </Link>
                  ) : (
                    m.referenceNo ?? '—'
                  )}
                </td>
                <td className={`num font-medium ${m.qtyChange < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {m.qtyChange > 0 ? '+' : ''}
                  {qty(m.qtyChange)}
                </td>
                <td className="num">{qty(m.balanceAfter, unitSymbol)}</td>
                <td className="max-w-xs truncate text-xs text-slate-500">{m.note}</td>
                <td className="text-xs text-slate-500">{m.createdByName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pagination page={page} pageSize={20} total={data.total} onChange={setPage} />
    </>
  );
}

export function ProductFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = useAuth();
  const canEdit = can('products.manage');
  const showCost = can('products.view_cost');
  const [form, setForm] = useState<FormState>(blank);
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const product = useQuery({ queryKey: ['products', 'detail', id], queryFn: () => api.get<Product>(`/products/${id}`), enabled: !isNew });
  const categories = useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => api.get<Category[]>('/catalog/categories') });
  const brands = useQuery({ queryKey: ['catalog', 'brands'], queryFn: () => api.get<Brand[]>('/catalog/brands') });
  const units = useQuery({ queryKey: ['catalog', 'units'], queryFn: () => api.get<Unit[]>('/catalog/units') });
  const taxes = useQuery({ queryKey: ['catalog', 'tax-rates'], queryFn: () => api.get<TaxRate[]>('/catalog/tax-rates') });
  const suppliers = useQuery({
    queryKey: ['suppliers', 'all'],
    queryFn: () => api.get<Paginated<Supplier>>('/suppliers', { pageSize: 500 }),
    enabled: can('suppliers.view') || canEdit,
  });

  useEffect(() => {
    if (product.data) setForm(fromProduct(product.data));
  }, [product.data]);

  useEffect(() => {
    if (isNew && taxes.data && form.taxRateId === '') {
      const def = taxes.data.find((t) => t.isDefault);
      if (def) setForm((f) => ({ ...f, taxRateId: def.id }));
    }
  }, [isNew, taxes.data, form.taxRateId]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const subcategories = useMemo(() => categories.data?.find((c) => c.id === form.categoryId)?.subcategories ?? [], [categories.data, form.categoryId]);
  const baseUnit = units.data?.find((u) => u.id === form.unitId);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Enter the product name');
      if (!form.categoryId) throw new Error('Select a category');
      if (!form.unitId) throw new Error('Select the base unit');
      if (form.salePrice === null) throw new Error('Enter the sale price');
      if (!form.taxRateId) throw new Error('Select a tax rate');
      if (form.units.some((u) => u.unitId === '' || !u.factor)) throw new Error('Complete or remove the empty alternate unit rows');
      const body = {
        name: form.name,
        urduName: form.urduName || null,
        categoryId: form.categoryId || null,
        subcategoryId: form.subcategoryId || null,
        brandId: form.brandId || null,
        specification: form.specification || null,
        size: form.size || null,
        sku: form.sku || null,
        barcode: form.barcode || null,
        unitId: form.unitId || null,
        purchasePrice: form.purchasePrice ?? 0,
        salePrice: form.salePrice,
        wholesalePrice: form.wholesalePrice,
        minSalePrice: form.minSalePrice,
        taxRateId: form.taxRateId || null,
        hsCode: form.hsCode || null,
        minStock: form.minStock ?? 0,
        supplierId: form.supplierId || null,
        location: form.location || null,
        trackStock: form.trackStock,
        notes: form.notes || null,
        isActive: form.isActive,
        units: form.units
          .filter((u) => u.unitId !== '')
          .map((u) => ({ unitId: u.unitId, factor: u.factor, salePrice: u.salePrice, wholesalePrice: u.wholesalePrice, barcode: u.barcode || null })),
        ...(isNew ? { openingStock: form.openingStock ?? 0 } : {}),
      };
      let saved = isNew ? await api.post<Product>('/products', body) : await api.put<Product>(`/products/${id}`, body);
      if (pendingImage) saved = await api.upload<Product>(`/products/${saved.id}/image`, pendingImage);
      return saved;
    },
    onSuccess: (p) => {
      toast.success(isNew ? `Product ${p.sku} created` : 'Product saved');
      setPendingImage(null);
      qc.invalidateQueries({ queryKey: ['products'] });
      if (isNew) navigate(`/products/${p.id}`, { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const removeImage = useMutation({
    mutationFn: () => api.del<Product>(`/products/${id}/image`),
    onSuccess: () => {
      toast.success('Image removed');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await resizeImage(file);
      setPendingImage(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (!isNew && product.isLoading) return <Spinner />;
  const p = product.data;
  const imageUrl = previewUrl ?? p?.imageUrl ?? null;
  const margin =
    showCost && form.salePrice && p?.costPrice
      ? Math.round(((form.salePrice - p.costPrice) / form.salePrice) * 1000) / 10
      : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={isNew ? 'Add product' : form.name || 'Product'}
        subtitle={p ? `${p.sku} · ${p.categoryName}${p.subcategoryName ? ` › ${p.subcategoryName}` : ''}` : 'Category → Subcategory → Product'}
        actions={
          canEdit && (
            <>
              <Button onClick={() => navigate('/products')}>Back</Button>
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
                {isNew ? 'Create product' : 'Save changes'}
              </Button>
            </>
          )
        }
      />
      <fieldset disabled={!canEdit} className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Classification">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product name" required className="sm:col-span-2">
                <Input autoFocus={isNew} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Lucky OPC Cement" />
              </Field>
              <Field label="Category" required>
                <Select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: Number(e.target.value) || '', subcategoryId: '' }))}>
                  <option value="">Select category…</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Subcategory">
                <Select value={form.subcategoryId} disabled={!form.categoryId} onChange={(e) => set('subcategoryId', Number(e.target.value) || '')}>
                  <option value="">—</option>
                  {subcategories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Brand">
                <Select value={form.brandId} onChange={(e) => set('brandId', Number(e.target.value) || '')}>
                  <option value="">No brand</option>
                  {brands.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Grade / Specification" hint="e.g. Grade 60, Class B, PN-20">
                <Input value={form.specification} onChange={(e) => set('specification', e.target.value)} />
              </Field>
              <Field label="Size" hint="e.g. 50 KG, 12mm, 4 inch, 24x24">
                <Input value={form.size} onChange={(e) => set('size', e.target.value)} />
              </Field>
              <Field label="Urdu name (printed on receipt)">
                <Input className="urdu text-right" dir="rtl" value={form.urduName} onChange={(e) => set('urduName', e.target.value)} placeholder="اختیاری" />
              </Field>
              <Field label="SKU / Item code" hint={isNew ? 'Leave empty to auto-generate' : undefined}>
                <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} />
              </Field>
              <Field label="Barcode / QR value" hint="Scan the product barcode here">
                <Input value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="Unit, pricing & tax">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Base unit" required hint="Stock is kept in this unit">
                <Select value={form.unitId} onChange={(e) => set('unitId', Number(e.target.value) || '')}>
                  <option value="">Select unit…</option>
                  {units.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.symbol})
                    </option>
                  ))}
                </Select>
              </Field>
              {showCost && (
                <Field label={`Purchase price / ${baseUnit?.symbol ?? 'unit'}`} hint={p ? `Average cost: ${money(p.costPrice)}` : undefined}>
                  <MoneyInput value={form.purchasePrice} onChange={(v) => set('purchasePrice', v)} />
                </Field>
              )}
              <Field label={`Sale price / ${baseUnit?.symbol ?? 'unit'}`} required hint={margin !== null ? `Margin ${margin}%` : undefined}>
                <MoneyInput value={form.salePrice} onChange={(v) => set('salePrice', v)} />
              </Field>
              <Field label="Wholesale / contractor price" hint="Used for wholesale customers">
                <MoneyInput value={form.wholesalePrice} onChange={(v) => set('wholesalePrice', v)} />
              </Field>
              <Field label="Minimum sale price" hint="Cashiers cannot sell below this">
                <MoneyInput value={form.minSalePrice} onChange={(v) => set('minSalePrice', v)} />
              </Field>
              <Field label="Tax rate" required>
                <Select value={form.taxRateId} onChange={(e) => set('taxRateId', Number(e.target.value) || '')}>
                  {taxes.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="HS / PCT code" hint="Needed for FBR invoices">
                <Input value={form.hsCode} onChange={(e) => set('hsCode', e.target.value)} placeholder="2523.2900" />
              </Field>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Alternate selling units</p>
                  <p className="text-xs text-slate-500">e.g. Sand in CFT → Trolley = 150 CFT, Truck = 600 CFT · Steel in KG → Ton = 1000 KG · Bricks → 1000</p>
                </div>
                <Button size="sm" icon={<Plus className="h-4 w-4" />} disabled={!form.unitId} onClick={() => set('units', [...form.units, { unitId: '', factor: null, salePrice: null, wholesalePrice: null, barcode: '' }])}>
                  Add unit
                </Button>
              </div>
              {form.units.length > 0 && (
                <TableWrap>
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Contains ({baseUnit?.symbol ?? 'base'})</th>
                        <th>Sale price</th>
                        <th>Wholesale</th>
                        <th>Barcode</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {form.units.map((u, i) => {
                        const auto = u.factor && form.salePrice ? Math.round(form.salePrice * u.factor) : null;
                        const update = (patch: Partial<UnitRow>) => set('units', form.units.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
                        return (
                          <tr key={i}>
                            <td className="min-w-[8rem]">
                              <Select value={u.unitId} onChange={(e) => update({ unitId: Number(e.target.value) || '' })}>
                                <option value="">Select…</option>
                                {units.data
                                  ?.filter((x) => x.id !== form.unitId)
                                  .map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.name}
                                    </option>
                                  ))}
                              </Select>
                            </td>
                            <td className="w-32">
                              <QtyInput value={u.factor} onChange={(v) => update({ factor: v })} />
                            </td>
                            <td className="w-36">
                              <MoneyInput value={u.salePrice} onChange={(v) => update({ salePrice: v })} placeholder={auto ? String(auto / 100) : 'auto'} />
                            </td>
                            <td className="w-36">
                              <MoneyInput value={u.wholesalePrice} onChange={(v) => update({ wholesalePrice: v })} placeholder="auto" />
                            </td>
                            <td className="w-36">
                              <Input value={u.barcode} onChange={(e) => update({ barcode: e.target.value })} />
                            </td>
                            <td>
                              <Button size="sm" variant="ghost" aria-label="Remove unit" onClick={() => set('units', form.units.filter((_, idx) => idx !== i))}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Image">
            <div className="flex flex-col items-center gap-3">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-44 w-full rounded-md border border-slate-200 bg-white object-contain" />
              ) : (
                <ProductThumb product={{ imageUrl: null, name: form.name }} size="lg" className="h-44 w-full" />
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
              <div className="flex gap-2">
                <Button size="sm" icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
                  {imageUrl ? 'Change image' : 'Upload image'}
                </Button>
                {p?.imageUrl && !pendingImage && (
                  <Button size="sm" variant="ghost" loading={removeImage.isPending} onClick={() => removeImage.mutate()}>
                    Remove
                  </Button>
                )}
              </div>
              {pendingImage && <p className="text-xs text-amber-700">New image will be uploaded when you save.</p>}
            </div>
          </Card>

          <Card title="Stock">
            <div className="space-y-3">
              {p && (
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Current stock</p>
                  <p className={`text-2xl font-semibold ${p.trackStock && p.stockQty <= p.minStock ? 'text-red-600' : 'text-slate-900'}`}>{qty(p.stockQty, p.unitSymbol)}</p>
                  {showCost && p.trackStock && <p className="text-xs text-slate-500">Worth {money(Math.round(Math.max(0, p.stockQty) * (p.costPrice ?? 0)))} at cost</p>}
                  {can('inventory.adjust') && (
                    <Link to={`/stock?product=${p.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                      Adjust stock →
                    </Link>
                  )}
                </div>
              )}
              {isNew && (
                <Field label="Opening stock" hint="Quantity currently in the shop/yard">
                  <QtyInput value={form.openingStock} allowDecimal={baseUnit?.allowDecimal ?? true} onChange={(v) => set('openingStock', v)} />
                </Field>
              )}
              <Field label="Minimum stock (reorder level)">
                <QtyInput value={form.minStock} onChange={(v) => set('minStock', v)} />
              </Field>
              <Field label="Default supplier">
                <Select value={form.supplierId} onChange={(e) => set('supplierId', Number(e.target.value) || '')}>
                  <option value="">—</option>
                  {suppliers.data?.data.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Location (rack / yard)">
                <Input value={form.location} onChange={(e) => set('location', e.target.value)} />
              </Field>
              <Checkbox checked={form.trackStock} onChange={(v) => set('trackStock', v)} label="Track stock" description="Turn off for services (e.g. cutting, transport)" />
              <Checkbox checked={form.isActive} onChange={(v) => set('isActive', v)} label="Active" description="Inactive products are hidden from the POS" />
            </div>
          </Card>

          <Card title="Notes">
            <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Card>
        </div>
      </fieldset>

      {p && (
        <Card
          title={
            <span className="flex items-center gap-2">
              Stock history <Badge>{p.unitSymbol}</Badge>
            </span>
          }
          bodyClassName="p-0"
        >
          <Movements productId={p.id} unitSymbol={p.unitSymbol} />
        </Card>
      )}
    </div>
  );
}
