import type { ReactNode } from 'react';
import type { Customer, Paginated, Product, Supplier } from '@pos/shared';
import clsx from 'clsx';
import { Package } from 'lucide-react';
import { api } from '../lib/api';
import { money, qty } from '../lib/format';
import { Combobox } from './Combobox';

export function ProductThumb({ product, size = 'md', className }: { product: Pick<Product, 'imageUrl' | 'name'>; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dim = { sm: 'h-8 w-8', md: 'h-11 w-11', lg: 'h-20 w-20' }[size];
  if (product.imageUrl) {
    return <img src={product.imageUrl} alt="" loading="lazy" className={clsx(dim, 'shrink-0 rounded-md border border-slate-200 bg-white object-cover', className)} />;
  }
  return (
    <div className={clsx(dim, 'flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-300', className)}>
      <Package className={size === 'lg' ? 'h-8 w-8' : 'h-4 w-4'} />
    </div>
  );
}

export function CustomerPicker({
  value,
  onChange,
  placeholder = 'Search customer by name, phone or CNIC…',
  autoFocus,
  footer,
  id,
}: {
  value: Customer | null;
  onChange: (c: Customer | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  footer?: ReactNode;
  id?: string;
}) {
  return (
    <Combobox<Customer>
      id={id}
      value={value}
      onChange={onChange}
      queryKey="customers"
      fetcher={async (search) => (await api.get<Paginated<Customer>>('/customers', { search, pageSize: 20 })).data}
      getKey={(c) => c.id}
      getLabel={(c) => c.name}
      placeholder={placeholder}
      autoFocus={autoFocus}
      footer={footer}
      renderOption={(c) => (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">{c.name}</p>
            <p className="truncate text-xs text-slate-500">{[c.phone, c.cnic, c.city].filter(Boolean).join(' · ') || '—'}</p>
          </div>
          {c.balance !== 0 && (
            <span className={clsx('shrink-0 text-xs font-semibold tabular-nums', c.balance > 0 ? 'text-red-600' : 'text-emerald-600')}>
              {money(Math.abs(c.balance))} {c.balance > 0 ? 'due' : 'adv'}
            </span>
          )}
        </div>
      )}
    />
  );
}

export function SupplierPicker({ value, onChange, autoFocus }: { value: Supplier | null; onChange: (s: Supplier | null) => void; autoFocus?: boolean }) {
  return (
    <Combobox<Supplier>
      value={value}
      onChange={onChange}
      queryKey="suppliers"
      fetcher={async (search) => (await api.get<Paginated<Supplier>>('/suppliers', { search, pageSize: 20 })).data}
      getKey={(s) => s.id}
      getLabel={(s) => s.name}
      placeholder="Search supplier…"
      autoFocus={autoFocus}
      renderOption={(s) => (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">{s.name}</p>
            <p className="truncate text-xs text-slate-500">{[s.company, s.phone].filter(Boolean).join(' · ') || '—'}</p>
          </div>
          {s.balance !== 0 && <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-600">{money(s.balance)}</span>}
        </div>
      )}
    />
  );
}

export function productSubtitle(p: Product): string {
  return [p.brandName, p.specification, p.size].filter(Boolean).join(' · ');
}

export function ProductPicker({
  value,
  onChange,
  autoFocus,
  placeholder = 'Search product by name, SKU or barcode…',
  showCost,
}: {
  value: Product | null;
  onChange: (p: Product | null) => void;
  autoFocus?: boolean;
  placeholder?: string;
  showCost?: boolean;
}) {
  return (
    <Combobox<Product>
      value={value}
      onChange={onChange}
      queryKey="products"
      fetcher={async (search) => (await api.get<Paginated<Product>>('/products', { search, pageSize: 25 })).data}
      getKey={(p) => p.id}
      getLabel={(p) => p.name}
      placeholder={placeholder}
      autoFocus={autoFocus}
      renderOption={(p) => (
        <div className="flex items-center gap-3">
          <ProductThumb product={p} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-800">{p.name}</p>
            <p className="truncate text-xs text-slate-500">
              {p.sku} {productSubtitle(p) && `· ${productSubtitle(p)}`}
            </p>
          </div>
          <div className="shrink-0 text-right text-xs">
            <p className="font-semibold tabular-nums text-slate-700">{showCost && p.costPrice !== undefined ? `Cost ${money(p.costPrice)}` : money(p.salePrice)}</p>
            <p className={clsx('tabular-nums', p.stockQty <= p.minStock ? 'text-red-600' : 'text-slate-500')}>{qty(p.stockQty, p.unitSymbol)}</p>
          </div>
        </div>
      )}
    />
  );
}
