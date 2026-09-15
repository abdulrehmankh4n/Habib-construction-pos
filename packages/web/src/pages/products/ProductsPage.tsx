import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Package, Plus } from 'lucide-react';
import type { Brand, Category, Paginated, Product } from '@pos/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDebounce } from '../../lib/hooks';
import { csvMoney, downloadCsv, money, qty } from '../../lib/format';
import { Badge, Button, Card, Checkbox, EmptyState, PageHeader, Pagination, SearchInput, Select, Spinner, TableWrap } from '../../components/ui';
import { ProductThumb, productSubtitle } from '../../components/pickers';

export function ProductsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 250);
  const showCost = can('products.view_cost');

  const categories = useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => api.get<Category[]>('/catalog/categories') });
  const brands = useQuery({ queryKey: ['catalog', 'brands'], queryFn: () => api.get<Brand[]>('/catalog/brands') });
  const filters = { search: debounced, categoryId, subcategoryId, brandId, lowStock: lowStock || undefined, includeInactive: includeInactive || undefined };
  const { data, isLoading } = useQuery({
    queryKey: ['products', 'list', filters, page],
    queryFn: () => api.get<Paginated<Product>>('/products', { ...filters, page, pageSize: 50 }),
    placeholderData: (prev) => prev,
  });
  const subcategories = categories.data?.find((c) => String(c.id) === categoryId)?.subcategories ?? [];

  const exportCsv = async () => {
    const all = await api.get<Paginated<Product>>('/products', { ...filters, page: 1, pageSize: 500 });
    downloadCsv('products.csv', [
      ['SKU', 'Barcode', 'Name', 'Category', 'Subcategory', 'Brand', 'Specification', 'Size', 'Unit', 'Stock', 'Min stock', ...(showCost ? ['Cost price'] : []), 'Sale price', 'Wholesale price', 'Tax', 'Active'],
      ...all.data.map((p) => [
        p.sku,
        p.barcode,
        p.name,
        p.categoryName,
        p.subcategoryName,
        p.brandName,
        p.specification,
        p.size,
        p.unitSymbol,
        p.stockQty,
        p.minStock,
        ...(showCost ? [csvMoney(p.costPrice)] : []),
        csvMoney(p.salePrice),
        csvMoney(p.wholesalePrice),
        p.taxRateName,
        p.isActive ? 'Yes' : 'No',
      ]),
    ]);
  };

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Category → Subcategory → Product with brand, grade, unit, prices, stock and supplier"
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>
              CSV
            </Button>
            {can('products.manage') && (
              <Link to="/products/new">
                <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                  Add product
                </Button>
              </Link>
            )}
          </>
        }
      />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <SearchInput className="w-full sm:w-72" value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Name, SKU, barcode, brand, size…" />
          <Select className="w-44" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); setPage(1); }} aria-label="Category">
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select className="w-48" value={subcategoryId} disabled={!categoryId} onChange={(e) => { setSubcategoryId(e.target.value); setPage(1); }} aria-label="Subcategory">
            <option value="">All subcategories</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select className="w-40" value={brandId} onChange={(e) => { setBrandId(e.target.value); setPage(1); }} aria-label="Brand">
            <option value="">All brands</option>
            {brands.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Checkbox checked={lowStock} onChange={(v) => { setLowStock(v); setPage(1); }} label="Low stock only" />
          <Checkbox checked={includeInactive} onChange={(v) => { setIncludeInactive(v); setPage(1); }} label="Show inactive" />
        </div>
        {isLoading ? (
          <Spinner />
        ) : !data?.data.length ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="No products found"
            description={can('products.manage') ? 'Add your first product or change the filters.' : 'Change the filters.'}
          />
        ) : (
          <>
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="num">Stock</th>
                    {showCost && <th className="num">Cost</th>}
                    <th className="num">Sale price</th>
                    <th className="num">Wholesale</th>
                    <th>Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((p) => {
                    const low = p.trackStock && p.stockQty <= p.minStock;
                    return (
                      <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/products/${p.id}`)}>
                        <td>
                          <div className="flex items-center gap-3">
                            <ProductThumb product={p} size="sm" />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800">
                                {p.name} {!p.isActive && <Badge color="gray">Inactive</Badge>}
                              </p>
                              <p className="text-xs text-slate-500">
                                {p.sku}
                                {productSubtitle(p) && ` · ${productSubtitle(p)}`}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="text-sm">
                          {p.categoryName}
                          {p.subcategoryName && <p className="text-xs text-slate-500">{p.subcategoryName}</p>}
                        </td>
                        <td className={`num whitespace-nowrap ${low ? 'font-semibold text-red-600' : ''}`}>{p.trackStock ? qty(p.stockQty, p.unitSymbol) : '—'}</td>
                        {showCost && <td className="num text-slate-600">{money(p.costPrice)}</td>}
                        <td className="num font-medium">
                          {money(p.salePrice)}
                          <span className="text-xs font-normal text-slate-500">/{p.unitSymbol}</span>
                        </td>
                        <td className="num text-slate-600">{p.wholesalePrice !== null ? money(p.wholesalePrice) : '—'}</td>
                        <td className="text-sm text-slate-600">{p.supplierName ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            <Pagination page={page} pageSize={50} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
