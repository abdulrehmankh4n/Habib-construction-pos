import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  Camera,
  CheckCircle2,
  FileText,
  PauseCircle,
  Percent,
  Printer,
  RotateCcw,
  ShoppingCart,
  Trash2,
  Truck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  lineGross,
  resolveUnit,
  type Category,
  type HeldBill,
  type Paginated,
  type PaymentMethod,
  type Product,
  type Quotation,
  type Sale,
} from '@pos/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth, useSettings } from '../../lib/auth';
import { useDebounce, useHotkeys } from '../../lib/hooks';
import { dateTimeLabel, money, qty as fmtQty } from '../../lib/format';
import { printUrl } from '../../lib/print';
import { Badge, Button, EmptyState, Field, Input, Modal, MoneyInput, QtyInput, Select, Spinner } from '../../components/ui';
import { CustomerPicker, ProductThumb, productSubtitle } from '../../components/pickers';
import { CustomerFormModal } from '../../components/CustomerFormModal';
import { ScannerModal } from '../../components/ScannerModal';
import { SendMessageButtons } from '../../components/SendMessage';
import { PaymentModal } from './PaymentModal';
import {
  cartPayload,
  cartReducer,
  computeTotals,
  effectiveBillDiscount,
  emptyCart,
  stockWarning,
  type CartState,
} from './cart';

function ProductTile({ product, tierPrice, onAdd }: { product: Product; tierPrice: number; onAdd: (unitId?: number) => void }) {
  const low = product.trackStock && product.stockQty <= product.minStock;
  const out = product.trackStock && product.stockQty <= 0;
  return (
    <div className={clsx('group flex flex-col rounded-lg border bg-white p-2.5 shadow-sm transition hover:border-brand-400 hover:shadow', out ? 'border-red-200' : 'border-slate-200')}>
      <button type="button" className="flex flex-1 gap-2.5 text-left" onClick={() => onAdd()}>
        <ProductThumb product={product} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-800">{product.name}</p>
          <p className="truncate text-xs text-slate-500">{productSubtitle(product) || product.sku}</p>
        </div>
      </button>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {money(tierPrice)}
            <span className="text-xs font-normal text-slate-500"> /{product.unitSymbol}</span>
          </p>
          {product.trackStock && (
            <p className={clsx('text-xs', out ? 'font-medium text-red-600' : low ? 'text-amber-700' : 'text-slate-500')}>
              Stock: {fmtQty(product.stockQty, product.unitSymbol)}
            </p>
          )}
        </div>
        {product.units.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1">
            {product.units.map((u) => (
              <button
                key={u.unitId}
                type="button"
                title={`Add 1 ${u.unitName} (${u.factor} ${product.unitSymbol})`}
                className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800"
                onClick={() => onAdd(u.unitId)}
              >
                +{u.unitSymbol}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HeldBillsModal({ open, onClose, onResume }: { open: boolean; onClose: () => void; onResume: (bill: HeldBill) => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['held-bills'], queryFn: () => api.get<HeldBill[]>('/held-bills'), enabled: open });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/held-bills/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['held-bills'] }),
  });
  return (
    <Modal open={open} onClose={onClose} title="Held bills" size="lg">
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <EmptyState icon={<PauseCircle className="h-8 w-8" />} title="No bills on hold" description="Use Hold (F8) to park a bill and serve another customer." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{b.label}</p>
                <p className="text-xs text-slate-500">
                  {b.customerName ?? 'Walk-in'} · {dateTimeLabel(b.createdAt)} · by {b.createdByName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">{money(b.total)}</span>
                <Button size="sm" variant="primary" onClick={() => onResume(b)}>
                  Resume
                </Button>
                <Button size="sm" variant="ghost" aria-label="Delete held bill" onClick={() => remove.mutate(b.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function SaleSuccessModal({ sale, onClose, paper }: { sale: Sale | null; onClose: () => void; paper: string }) {
  const newRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (sale) setTimeout(() => newRef.current?.focus(), 80);
  }, [sale]);
  if (!sale) return null;
  return (
    <Modal open onClose={onClose} title="Sale completed" size="md" closeOnBackdrop={false}>
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <div>
          <p className="text-lg font-semibold text-slate-900">{sale.invoiceNo}</p>
          <p className="text-sm text-slate-500">{sale.customerName ?? 'Walk-in customer'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-left">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-lg font-semibold">{money(sale.grandTotal)}</p>
          </div>
          {sale.changeDue > 0 ? (
            <div className="rounded-md bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Change to return</p>
              <p className="text-lg font-semibold text-emerald-800">{money(sale.changeDue)}</p>
            </div>
          ) : sale.balanceDue > 0 ? (
            <div className="rounded-md bg-amber-50 p-3">
              <p className="text-xs text-amber-700">Added to khata</p>
              <p className="text-lg font-semibold text-amber-800">{money(sale.balanceDue)}</p>
            </div>
          ) : (
            <div className="rounded-md bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Paid</p>
              <p className="text-lg font-semibold text-emerald-800">{money(sale.paidAmount)}</p>
            </div>
          )}
        </div>
        {sale.fbrStatus === 'synced' && <p className="text-xs text-slate-500">FBR invoice: {sale.fbrInvoiceNo}</p>}
        {sale.fbrStatus === 'failed' && <p className="text-xs text-amber-700">FBR sync pending: {sale.fbrError}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => printUrl(`/print/sale/${sale.id}?format=${paper === 'a4' ? 'thermal80' : paper}`)}>
            Receipt
          </Button>
          <Button icon={<FileText className="h-4 w-4" />} onClick={() => printUrl(`/print/sale/${sale.id}?format=a4`)}>
            A4 Invoice
          </Button>
          {sale.deliveryRequired && (
            <Button icon={<Truck className="h-4 w-4" />} onClick={() => printUrl(`/print/sale/${sale.id}?format=challan`)}>
              Delivery challan
            </Button>
          )}
          <SendMessageButtons type="sale" id={sale.id} />
        </div>
        <Button ref={newRef} variant="primary" size="lg" className="w-full" onClick={onClose}>
          New sale
        </Button>
      </div>
    </Modal>
  );
}

function loadDraft(key: string): CartState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return emptyCart;
    const parsed = JSON.parse(raw) as CartState;
    return { ...emptyCart, ...parsed, delivery: { ...emptyCart.delivery, ...parsed.delivery } };
  } catch {
    return emptyCart;
  }
}

export function PosPage() {
  const { user, can } = useAuth();
  const settings = useSettings();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const draftKey = `pos.cart.${user?.id ?? 0}`;
  const [cart, dispatch] = useReducer(cartReducer, draftKey, loadDraft);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [completed, setCompleted] = useState<Sale | null>(null);
  const [savedQuotation, setSavedQuotation] = useState<Quotation | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'products' | 'cart'>('products');
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>(cart.billDiscountPercent !== null ? 'percent' : 'amount');
  const searchRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounce(search, 200);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(cart));
    } catch {
      return;
    }
  }, [cart, draftKey]);

  const categories = useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => api.get<Category[]>('/catalog/categories') });
  const products = useQuery({
    queryKey: ['products', 'pos', debounced, categoryId],
    queryFn: () => api.get<Paginated<Product>>('/products', { search: debounced, categoryId, pageSize: 60 }),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!products.data) return;
    for (const p of products.data.data) {
      if (cart.lines.some((l) => l.product.id === p.id && l.product.stockQty !== p.stockQty)) dispatch({ type: 'refreshProduct', product: p });
    }
  }, [products.data, cart.lines]);

  const totals = useMemo(() => computeTotals(cart, settings.data), [cart, settings.data]);
  const billDiscount = effectiveBillDiscount(cart);
  const itemCount = cart.lines.length;

  const focusSearch = useCallback(() => {
    setTimeout(() => searchRef.current?.focus(), 30);
  }, []);

  const addProduct = useCallback(
    (product: Product, unitId?: number) => {
      if (!product.isActive) return toast.error(`${product.name} is inactive`);
      dispatch({ type: 'add', product, unitId });
      const unit = resolveUnit(product, unitId ?? product.unitId);
      toast.success(`Added ${product.name}${unit && unit.unitId !== product.unitId ? ` (${unit.unitName})` : ''}`, { duration: 1200 });
    },
    [],
  );

  const lookupAndAdd = useCallback(
    async (code: string) => {
      try {
        const res = await api.get<{ product: Product; unitId: number }>('/products/lookup', { code });
        addProduct(res.product, res.unitId);
        return true;
      } catch {
        return false;
      }
    },
    [addProduct],
  );

  const onSearchEnter = async () => {
    const term = search.trim();
    if (!term) return;
    if (await lookupAndAdd(term)) {
      setSearch('');
      return;
    }
    const list = products.data?.data ?? [];
    if (debounced === search && list.length === 1) {
      addProduct(list[0]);
      setSearch('');
    } else if (debounced === search && list.length === 0) {
      toast.error(`No product found for "${term}"`);
    }
  };

  useEffect(() => {
    const quotationId = Number(params.get('quotation') ?? params.get('editQuotation'));
    if (!quotationId) return;
    const edit = params.has('editQuotation');
    (async () => {
      try {
        const q = await api.get<Quotation>(`/quotations/${quotationId}`);
        const fresh = await Promise.all((q.items ?? []).map((i) => api.get<Product>(`/products/${i.productId}`)));
        const customer = q.customerId ? await api.get<CartState['customer']>(`/customers/${q.customerId}`) : null;
        dispatch({
          type: 'load',
          state: {
            ...emptyCart,
            mode: edit ? 'quotation' : 'sale',
            customer,
            walkInName: q.customerId ? '' : q.customerName ?? '',
            walkInPhone: q.customerId ? '' : q.customerPhone ?? '',
            priceTier: q.priceTier,
            billDiscount: q.billDiscount,
            deliveryCharges: q.deliveryCharges,
            labourCharges: q.labourCharges,
            notes: q.notes ?? '',
            quotationId: edit ? null : q.id,
            editQuotationId: edit ? q.id : null,
            lines: (q.items ?? []).map((i, idx) => ({
              key: `q${i.id}`,
              product: fresh[idx],
              unitId: i.unitId,
              qty: i.qty,
              unitPrice: i.unitPrice,
              discount: i.discount,
              priceEdited: true,
            })),
          },
        });
        toast.success(`${edit ? 'Editing' : 'Loaded'} quotation ${q.quotationNo}`);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setParams({}, { replace: true });
      }
    })();
  }, [params, setParams]);

  const checkout = useMutation({
    mutationFn: (payments: { method: PaymentMethod; amount: number; reference: string | null }[]) =>
      api.post<Sale>('/sales', {
        ...cartPayload(cart, billDiscount),
        payments,
        delivery: cart.delivery.required
          ? {
              required: true,
              address: cart.delivery.address || null,
              vehicleNo: cart.delivery.vehicleNo || null,
              driverName: cart.delivery.driverName || null,
              driverPhone: cart.delivery.driverPhone || null,
            }
          : undefined,
        quotationId: cart.quotationId,
        heldBillId: cart.heldBillId,
      }),
    onSuccess: (sale) => {
      setPayOpen(false);
      setCompleted(sale);
      dispatch({ type: 'clear' });
      qc.invalidateQueries({ queryKey: ['products'] });
      if (settings.data?.receipt.autoPrint) {
        const paper = settings.data.receipt.paper;
        printUrl(`/print/sale/${sale.id}?format=${paper}`);
      }
    },
    onError: (e) => toast.error(errorMessage(e), { duration: 8000 }),
  });

  const saveQuotation = useMutation({
    mutationFn: () => {
      const body = cartPayload(cart, billDiscount);
      return cart.editQuotationId ? api.put<Quotation>(`/quotations/${cart.editQuotationId}`, body) : api.post<Quotation>('/quotations', body);
    },
    onSuccess: (q) => {
      setSavedQuotation(q);
      dispatch({ type: 'clear' });
      qc.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (e) => toast.error(errorMessage(e), { duration: 8000 }),
  });

  const hold = useMutation({
    mutationFn: () =>
      api.post('/held-bills', {
        label: cart.customer?.name ?? (cart.walkInName || `Bill ${new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}`),
        customerId: cart.customer?.id ?? null,
        total: totals.grandTotal,
        payload: { ...cart, heldBillId: null },
      }),
    onSuccess: () => {
      toast.success('Bill put on hold');
      dispatch({ type: 'clear' });
      qc.invalidateQueries({ queryKey: ['held-bills'] });
      focusSearch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const heldCount = useQuery({ queryKey: ['held-bills'], queryFn: () => api.get<HeldBill[]>('/held-bills') }).data?.length ?? 0;

  const validLines = cart.lines.length > 0 && cart.lines.every((l) => l.qty > 0);
  const primaryAction = () => {
    if (!validLines) return toast.error('Add items with a quantity greater than zero');
    if (cart.mode === 'quotation') saveQuotation.mutate();
    else setPayOpen(true);
  };

  useHotkeys(
    {
      F2: () => searchRef.current?.focus(),
      F4: () => document.getElementById('pos-customer')?.focus(),
      F8: () => cart.lines.length && hold.mutate(),
      F9: primaryAction,
      F10: () => setHeldOpen(true),
    },
    !payOpen && !completed && !savedQuotation,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (payOpen || completed || scanOpen || newCustomerOpen || heldOpen) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payOpen, completed, scanOpen, newCustomerOpen, heldOpen]);

  const tier = cart.priceTier;
  const tierPriceOf = (p: Product) => (tier === 'wholesale' ? p.wholesalePrice ?? p.salePrice : p.salePrice);
  const taxEnabled = settings.data?.tax.enabled ?? false;
  const inclusive = settings.data?.tax.pricesIncludeTax ?? true;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex shrink-0 gap-1 border-b border-slate-200 bg-white p-2 lg:hidden">
        <Button size="sm" variant={mobilePanel === 'products' ? 'primary' : 'ghost'} className="flex-1" onClick={() => setMobilePanel('products')}>
          Products
        </Button>
        <Button size="sm" variant={mobilePanel === 'cart' ? 'primary' : 'ghost'} className="flex-1" onClick={() => setMobilePanel('cart')}>
          Cart ({itemCount}) · {money(totals.grandTotal)}
        </Button>
      </div>

      <section className={clsx('min-h-0 min-w-0 flex-1 flex-col bg-slate-100', mobilePanel === 'products' ? 'flex' : 'hidden lg:flex')}>
        <div className="space-y-2 border-b border-slate-200 bg-white p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={searchRef}
                autoFocus
                className="input h-11 pl-3 text-base"
                placeholder="Scan barcode / QR or search product (F2)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSearchEnter();
                  } else if (e.key === 'Escape') {
                    setSearch('');
                  }
                }}
              />
              {search && (
                <button type="button" aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700" onClick={() => setSearch('')}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button size="lg" className="h-11 px-3" title="Scan with camera" onClick={() => setScanOpen(true)} icon={<Camera className="h-5 w-5" />}>
              <span className="hidden xl:inline">Camera</span>
            </Button>
            <div className="flex overflow-hidden rounded-md border border-slate-300">
              {(['sale', 'quotation'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={clsx('px-3 text-sm font-medium', cart.mode === m ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
                  onClick={() => dispatch({ type: 'set', patch: { mode: m, quotationId: m === 'quotation' ? null : cart.quotationId } })}
                >
                  {m === 'sale' ? 'Sale' : 'Quotation'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              className={clsx('whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium', categoryId === null ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')}
              onClick={() => setCategoryId(null)}
            >
              All
            </button>
            {categories.data?.map((c) => (
              <button
                key={c.id}
                type="button"
                className={clsx('whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium', categoryId === c.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {products.isLoading ? (
            <Spinner />
          ) : !products.data?.data.length ? (
            <EmptyState title="No products found" description={search ? `Nothing matches "${search}".` : 'Add products from the Products page.'} />
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {products.data.data.map((p) => (
                <ProductTile key={p.id} product={p} tierPrice={tierPriceOf(p)} onAdd={(unitId) => addProduct(p, unitId)} />
              ))}
            </div>
          )}
          {products.data && products.data.total > products.data.data.length && (
            <p className="mt-3 text-center text-xs text-slate-500">Showing {products.data.data.length} of {products.data.total}. Refine your search to see more.</p>
          )}
        </div>
      </section>

      <section className={clsx('min-h-0 w-full flex-col border-l border-slate-200 bg-white lg:w-[460px] xl:w-[520px]', mobilePanel === 'cart' ? 'flex' : 'hidden lg:flex')}>
        <div className="space-y-2 border-b border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-800">{cart.mode === 'quotation' ? (cart.editQuotationId ? 'Edit quotation' : 'New quotation') : 'Current bill'}</h2>
              {cart.quotationId && <Badge color="violet">From quotation</Badge>}
              {cart.heldBillId && <Badge color="amber">Resumed</Badge>}
            </div>
            <div className="flex items-center gap-1">
              <Select
                className="h-8 w-32 py-0 text-xs"
                value={tier}
                onChange={(e) => dispatch({ type: 'tier', tier: e.target.value as 'retail' | 'wholesale' })}
                aria-label="Price level"
              >
                <option value="retail">Retail price</option>
                <option value="wholesale">Wholesale price</option>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <CustomerPicker
                id="pos-customer"
                value={cart.customer}
                onChange={(c) => dispatch({ type: 'customer', customer: c })}
                placeholder="Walk-in customer — search khata customer (F4)"
              />
            </div>
            {can('customers.manage') && (
              <Button title="New customer" onClick={() => setNewCustomerOpen(true)} icon={<UserPlus className="h-4 w-4" />} />
            )}
          </div>
          {cart.customer ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              {cart.customer.phone && <span>{cart.customer.phone}</span>}
              <span>
                Balance:{' '}
                <span className={clsx('font-semibold', cart.customer.balance > 0 ? 'text-red-600' : 'text-emerald-700')}>{money(cart.customer.balance)}</span>
              </span>
              {cart.customer.creditLimit !== null && <span>Limit: {money(cart.customer.creditLimit)}</span>}
              {cart.customer.priceTier === 'wholesale' && <Badge color="blue">Wholesale</Badge>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input className="h-8 py-1 text-sm" placeholder="Name (optional)" value={cart.walkInName} onChange={(e) => dispatch({ type: 'set', patch: { walkInName: e.target.value } })} />
              <Input className="h-8 py-1 text-sm" placeholder="Mobile (optional)" value={cart.walkInPhone} onChange={(e) => dispatch({ type: 'set', patch: { walkInPhone: e.target.value } })} />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {cart.lines.length === 0 ? (
            <EmptyState icon={<ShoppingCart className="h-10 w-10" />} title="Cart is empty" description="Scan a barcode or click a product to add it." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {cart.lines.map((l, idx) => {
                const unit = resolveUnit(l.product, l.unitId);
                const gross = lineGross(l.qty, l.unitPrice);
                const warn = stockWarning(l, cart.lines);
                return (
                  <li key={l.key} className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 w-5 shrink-0 text-xs text-slate-400">{idx + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-slate-800">{l.product.name}</p>
                        <p className="text-xs text-slate-500">
                          {productSubtitle(l.product)}
                          {unit && unit.factor !== 1 && ` · 1 ${unit.unitSymbol} = ${fmtQty(unit.factor)} ${l.product.unitSymbol}`}
                        </p>
                        {warn && <p className="text-xs font-medium text-red-600">{warn}</p>}
                      </div>
                      <button type="button" aria-label="Remove item" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => dispatch({ type: 'remove', key: l.key })}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1.5 grid grid-cols-12 items-center gap-1.5 pl-7">
                      <div className="col-span-3">
                        <QtyInput
                          className="h-8 py-1"
                          value={l.qty}
                          allowDecimal={unit?.allowDecimal ?? true}
                          onChange={(v) => dispatch({ type: 'qty', key: l.key, qty: v ?? 0 })}
                          aria-label="Quantity"
                        />
                      </div>
                      <div className="col-span-3">
                        {l.product.units.length > 0 ? (
                          <Select className="h-8 py-0 text-xs" value={l.unitId} onChange={(e) => dispatch({ type: 'unit', key: l.key, unitId: Number(e.target.value) })} aria-label="Unit">
                            <option value={l.product.unitId}>{l.product.unitSymbol}</option>
                            {l.product.units.map((u) => (
                              <option key={u.unitId} value={u.unitId}>
                                {u.unitSymbol}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-xs text-slate-500">{unit?.unitSymbol}</span>
                        )}
                      </div>
                      <div className="col-span-3">
                        <MoneyInput
                          className={clsx('h-8 py-1 text-sm', l.priceEdited && 'border-amber-400 bg-amber-50')}
                          prefix={false}
                          value={l.unitPrice}
                          onChange={(v) => dispatch({ type: 'price', key: l.key, unitPrice: v ?? 0 })}
                          aria-label="Unit price"
                        />
                      </div>
                      <div className="col-span-3 text-right text-sm font-semibold tabular-nums text-slate-900">{money(gross - l.discount)}</div>
                      <div className="col-span-6 col-start-7 flex items-center justify-end gap-1.5">
                        <span className="text-[11px] text-slate-400">Disc.</span>
                        <div className="w-24">
                          <MoneyInput className="h-7 py-0.5 text-xs" prefix={false} value={l.discount || null} onChange={(v) => dispatch({ type: 'discount', key: l.key, discount: v ?? 0 })} aria-label="Line discount" />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="label mb-0">Bill discount</span>
                <button
                  type="button"
                  title="Switch between rupees and percent"
                  className="flex h-5 items-center rounded bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-300"
                  onClick={() => {
                    const next = discountMode === 'amount' ? 'percent' : 'amount';
                    setDiscountMode(next);
                    dispatch({ type: 'set', patch: next === 'percent' ? { billDiscountPercent: 0, billDiscount: 0 } : { billDiscountPercent: null, billDiscount: 0 } });
                  }}
                >
                  {discountMode === 'amount' ? 'Rs' : <Percent className="h-3 w-3" />}
                </button>
              </div>
              {discountMode === 'amount' ? (
                <MoneyInput className="h-8 py-1" value={cart.billDiscount || null} onChange={(v) => dispatch({ type: 'set', patch: { billDiscount: v ?? 0 } })} />
              ) : (
                <QtyInput className="h-8 py-1" value={cart.billDiscountPercent} onChange={(v) => dispatch({ type: 'set', patch: { billDiscountPercent: Math.min(100, v ?? 0) } })} placeholder="%" />
              )}
            </div>
            <Field label="Delivery (kiraya)">
              <MoneyInput className="h-8 py-1" value={cart.deliveryCharges || null} onChange={(v) => dispatch({ type: 'set', patch: { deliveryCharges: v ?? 0 } })} />
            </Field>
            <Field label="Labour (mazdoori)">
              <MoneyInput className="h-8 py-1" value={cart.labourCharges || null} onChange={(v) => dispatch({ type: 'set', patch: { labourCharges: v ?? 0 } })} />
            </Field>
          </div>
          <div className="mt-3 space-y-0.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal ({itemCount} item{itemCount === 1 ? '' : 's'})</span>
              <span className="tabular-nums">{money(totals.subtotal)}</span>
            </div>
            {totals.itemDiscount + totals.billDiscount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Discount</span>
                <span className="tabular-nums">-{money(totals.itemDiscount + totals.billDiscount)}</span>
              </div>
            )}
            {taxEnabled && totals.taxTotal > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>GST {inclusive ? '(included)' : ''}</span>
                <span className="tabular-nums">{inclusive ? money(totals.taxTotal) : `+${money(totals.taxTotal)}`}</span>
              </div>
            )}
            {totals.deliveryCharges + totals.labourCharges > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Delivery + labour</span>
                <span className="tabular-nums">+{money(totals.deliveryCharges + totals.labourCharges)}</span>
              </div>
            )}
            {totals.roundOff !== 0 && (
              <div className="flex justify-between text-xs text-slate-500">
                <span>Round off</span>
                <span className="tabular-nums">{money(totals.roundOff)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-base font-semibold text-slate-900">Total</span>
              <span className="text-2xl font-bold text-slate-900">{money(totals.grandTotal)}</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Button title="Clear cart" icon={<RotateCcw className="h-4 w-4" />} disabled={!cart.lines.length} onClick={() => {
              if (window.confirm('Clear the current bill?')) {
                dispatch({ type: 'clear', keepMode: true });
                focusSearch();
              }
            }}>
              Clear
            </Button>
            <Button title="Hold bill (F8)" icon={<PauseCircle className="h-4 w-4" />} disabled={!cart.lines.length || cart.mode === 'quotation'} loading={hold.isPending} onClick={() => hold.mutate()}>
              Hold
            </Button>
            <Button title="Held bills (F10)" onClick={() => setHeldOpen(true)}>
              Held{heldCount ? ` (${heldCount})` : ''}
            </Button>
            <Button
              variant={cart.mode === 'quotation' ? 'primary' : 'success'}
              size="lg"
              className="col-span-4 h-12 text-base"
              disabled={!validLines}
              loading={saveQuotation.isPending}
              onClick={primaryAction}
            >
              {cart.mode === 'quotation' ? `Save quotation (F9) · ${money(totals.grandTotal)}` : `Pay (F9) · ${money(totals.grandTotal)}`}
            </Button>
          </div>
        </div>
      </section>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        totals={totals}
        cart={cart}
        allowCredit={settings.data?.sales.allowCredit ?? true}
        onDeliveryChange={(d) => dispatch({ type: 'set', patch: { delivery: d } })}
        onNotesChange={(notes) => dispatch({ type: 'set', patch: { notes } })}
        onSubmit={(payments) => checkout.mutate(payments)}
        submitting={checkout.isPending}
      />
      <HeldBillsModal
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        onResume={async (bill) => {
          if (cart.lines.length && !window.confirm('Replace the current bill with the held bill?')) return;
          const payload = bill.payload as CartState;
          const fresh = await Promise.all(payload.lines.map((l) => api.get<Product>(`/products/${l.product.id}`).catch(() => l.product)));
          dispatch({ type: 'load', state: { ...emptyCart, ...payload, lines: payload.lines.map((l, i) => ({ ...l, product: fresh[i] })), heldBillId: bill.id } });
          setHeldOpen(false);
          focusSearch();
        }}
      />
      <ScannerModal
        open={scanOpen}
        onClose={() => {
          setScanOpen(false);
          focusSearch();
        }}
        onDetected={async (code) => {
          if (!(await lookupAndAdd(code))) toast.error(`No product with code ${code}`);
        }}
      />
      <CustomerFormModal
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onSaved={(c) => dispatch({ type: 'customer', customer: c })}
      />
      <SaleSuccessModal
        sale={completed}
        paper={settings.data?.receipt.paper ?? 'thermal80'}
        onClose={() => {
          setCompleted(null);
          focusSearch();
        }}
      />
      {savedQuotation && (
        <Modal open onClose={() => setSavedQuotation(null)} title="Quotation saved" size="sm">
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="text-lg font-semibold">{savedQuotation.quotationNo}</p>
            <p className="text-sm text-slate-500">
              {savedQuotation.customerName ?? 'Walk-in'} · {money(savedQuotation.grandTotal)}
            </p>
            <div className="flex justify-center gap-2">
              <Button icon={<Printer className="h-4 w-4" />} onClick={() => printUrl(`/print/quotation/${savedQuotation.id}`)}>
                Print
              </Button>
              <Button onClick={() => navigate(`/quotations/${savedQuotation.id}`)}>Open</Button>
              <Button variant="primary" onClick={() => setSavedQuotation(null)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
