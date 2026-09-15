import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Trash2 } from 'lucide-react';
import type { Product } from '@pos/shared';
import { useSettings } from '../lib/auth';
import { money } from '../lib/format';
import { printUrl } from '../lib/print';
import { Barcode } from '../components/Barcode';
import { Button, Card, Checkbox, EmptyState, Field, PageHeader, QtyInput, Select } from '../components/ui';
import { ProductPicker, productSubtitle } from '../components/pickers';

export type LabelLayout = 'sheet' | 'roll';
export type LabelCode = 'both' | 'qr' | 'barcode';

export interface LabelJob {
  entries: { productId: number; copies: number }[];
  layout: LabelLayout;
  code: LabelCode;
  showPrice: boolean;
}

export const LABEL_JOB_KEY = 'pos.labels.job';

export function ProductLabel({ product, code, showPrice, shopName, layout }: { product: Product; code: LabelCode; showPrice: boolean; shopName: string; layout: LabelLayout }) {
  const value = product.barcode || product.sku;
  return (
    <div
      className="flex flex-col justify-between overflow-hidden bg-white p-1.5 text-black"
      style={layout === 'sheet' ? { width: '63.5mm', height: '38.1mm', outline: '1px dashed #cbd5e1' } : { width: '50mm', height: '30mm', breakAfter: 'page' }}
    >
      <div className="leading-tight">
        <p className="truncate text-[7pt] text-slate-600">{shopName}</p>
        <p className="line-clamp-2 text-[8.5pt] font-semibold">{product.name}</p>
        <p className="truncate text-[7pt]">{productSubtitle(product)}</p>
      </div>
      <div className="flex items-end justify-between gap-1">
        {(code === 'both' || code === 'barcode') && (
          <div className="min-w-0 flex-1">
            <Barcode value={value} height={code === 'both' ? 22 : 30} width={1.1} fontSize={8} />
          </div>
        )}
        {(code === 'both' || code === 'qr') && <QRCodeSVG value={value} size={code === 'both' ? 44 : 60} level="M" />}
        {code === 'qr' && <p className="flex-1 text-right font-mono text-[7pt]">{value}</p>}
      </div>
      {showPrice && (
        <p className="text-right text-[9pt] font-bold">
          {money(product.salePrice)} / {product.unitSymbol}
        </p>
      )}
    </div>
  );
}

export function LabelsPage() {
  const settings = useSettings();
  const [entries, setEntries] = useState<{ product: Product; copies: number }[]>([]);
  const [layout, setLayout] = useState<LabelLayout>('sheet');
  const [code, setCode] = useState<LabelCode>('both');
  const [showPrice, setShowPrice] = useState(true);
  const shopName = settings.data?.shop.name ?? '';
  const total = entries.reduce((s, e) => s + Math.max(0, e.copies), 0);

  const add = (p: Product | null) => {
    if (!p) return;
    setEntries((es) => (es.some((e) => e.product.id === p.id) ? es : [...es, { product: p, copies: 1 }]));
  };

  const print = () => {
    const job: LabelJob = { entries: entries.map((e) => ({ productId: e.product.id, copies: Math.min(500, e.copies) })), layout, code, showPrice };
    try {
      localStorage.setItem(LABEL_JOB_KEY, JSON.stringify(job));
    } catch {
      return;
    }
    printUrl('/print/labels');
  };

  return (
    <div>
      <PageHeader
        title="Barcode / QR labels"
        subtitle="Print scannable labels for products without a manufacturer barcode. Each label encodes the product barcode, or its SKU if there is none."
        actions={
          <Button variant="primary" icon={<Printer className="h-4 w-4" />} disabled={!total} onClick={print}>
            Print {total} label(s)
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Products" className="lg:col-span-2">
          <ProductPicker value={null} onChange={add} placeholder="Search product to add…" />
          {entries.length === 0 ? (
            <EmptyState title="No products selected" description="Search and add products above." />
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {entries.map((e) => (
                <li key={e.product.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.product.name}</p>
                    <p className="text-xs text-slate-500">{e.product.barcode ? `Barcode ${e.product.barcode}` : `SKU ${e.product.sku}`}</p>
                  </div>
                  <span className="text-xs text-slate-500">Copies</span>
                  <div className="w-20">
                    <QtyInput value={e.copies} allowDecimal={false} onChange={(v) => setEntries((es) => es.map((x) => (x.product.id === e.product.id ? { ...x, copies: v ?? 0 } : x)))} aria-label="Copies" />
                  </div>
                  <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setEntries((es) => es.filter((x) => x.product.id !== e.product.id))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Label options">
          <div className="space-y-3">
            <Field label="Layout">
              <Select value={layout} onChange={(e) => setLayout(e.target.value as LabelLayout)}>
                <option value="sheet">A4 sticker sheet (3 × 7, 63.5 × 38.1 mm)</option>
                <option value="roll">Label printer roll (50 × 30 mm)</option>
              </Select>
            </Field>
            <Field label="Code type">
              <Select value={code} onChange={(e) => setCode(e.target.value as LabelCode)}>
                <option value="both">Barcode + QR code</option>
                <option value="barcode">Barcode only (1D laser scanners)</option>
                <option value="qr">QR code only (camera / 2D scanners)</option>
              </Select>
            </Field>
            <Checkbox checked={showPrice} onChange={setShowPrice} label="Show sale price" />
          </div>
        </Card>
      </div>
      {entries.length > 0 && (
        <Card title="Preview" className="mt-4">
          <div className="flex flex-wrap gap-3">
            {entries.map((e) => (
              <ProductLabel key={e.product.id} product={e.product} code={code} showPrice={showPrice} shopName={shopName} layout={layout} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
