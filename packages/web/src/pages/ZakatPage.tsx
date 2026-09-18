import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calculator, Printer, Save } from 'lucide-react';
import type { Category, Paginated, ZakatComputation, ZakatReport } from '@pos/shared';
import { api, errorMessage } from '../lib/api';
import { useSettings } from '../lib/auth';
import { csvMoney, dateTimeLabel, downloadCsv, money, percent, qty } from '../lib/format';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, KeyValue, MoneyInput, PageHeader, Select, Spinner, StatCard, Tabs, TableWrap, Textarea } from '../components/ui';

interface Options {
  valuationBasis: 'retail' | 'wholesale' | 'cost';
  excludeCategoryIds: number[];
  includeCash: boolean;
  cashInHand: number | null;
  bankBalance: number | null;
  includeReceivables: boolean;
  receivablesOverride: number | null;
  otherAssets: number | null;
  deductPayables: boolean;
  otherLiabilities: number | null;
  nisabValue: number | null;
  rate: number;
  notes: string;
}

const BASIS_HINT: Record<Options['valuationBasis'], string> = {
  retail: 'Stock valued at the retail selling price',
  wholesale: 'Stock valued at the wholesale price (market value in bulk)',
  cost: 'Stock valued at purchase cost',
};

function CalculatorTab() {
  const settings = useSettings();
  const qc = useQueryClient();
  const categories = useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => api.get<Category[]>('/catalog/categories') });
  const [options, setOptions] = useState<Options>({
    valuationBasis: 'wholesale',
    excludeCategoryIds: [],
    includeCash: true,
    cashInHand: null,
    bankBalance: null,
    includeReceivables: true,
    receivablesOverride: null,
    otherAssets: null,
    deductPayables: true,
    otherLiabilities: null,
    nisabValue: null,
    rate: 2.5,
    notes: '',
  });
  const set = <K extends keyof Options>(k: K, v: Options[K]) => setOptions((o) => ({ ...o, [k]: v }));

  const body = {
    ...options,
    cashInHand: options.cashInHand,
    bankBalance: options.bankBalance ?? 0,
    otherAssets: options.otherAssets ?? 0,
    otherLiabilities: options.otherLiabilities ?? 0,
    nisabValue: options.nisabValue ?? settings.data?.zakat.nisabValue ?? 0,
  };

  const compute = useQuery({
    queryKey: ['zakat', 'compute', body],
    queryFn: () => api.post<ZakatComputation>('/zakat/compute', body),
    placeholderData: (prev) => prev,
  });

  const save = useMutation({
    mutationFn: () => api.post<ZakatReport>('/zakat/reports', body),
    onSuccess: (r) => {
      toast.success('Zakat report saved');
      qc.invalidateQueries({ queryKey: ['zakat'] });
      window.open(`/print/zakat/${r.id}`, '_blank', 'noopener');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const data = compute.data;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card title="Zakat settings" className="xl:col-span-1">
        <div className="space-y-3">
          <Field label="Stock valuation basis" hint={BASIS_HINT[options.valuationBasis]}>
            <Select value={options.valuationBasis} onChange={(e) => set('valuationBasis', e.target.value as Options['valuationBasis'])}>
              <option value="wholesale">Wholesale / market value</option>
              <option value="retail">Retail selling price</option>
              <option value="cost">Purchase cost</option>
            </Select>
          </Field>
          <div className="rounded-md border border-slate-200 p-3">
            <Checkbox checked={options.includeCash} onChange={(v) => set('includeCash', v)} label="Include cash" description="Cash in hand from the cash book plus bank balance" />
            {options.includeCash && (
              <div className="mt-2 grid gap-2">
                <Field label="Cash in hand" hint={data ? `Auto: ${money(data.cashValue - (options.bankBalance ?? 0))}` : undefined}>
                  <MoneyInput value={options.cashInHand} onChange={(v) => set('cashInHand', v)} placeholder="auto" />
                </Field>
                <Field label="Bank / mobile wallet balance">
                  <MoneyInput value={options.bankBalance} onChange={(v) => set('bankBalance', v)} />
                </Field>
              </div>
            )}
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <Checkbox checked={options.includeReceivables} onChange={(v) => set('includeReceivables', v)} label="Include receivables" description="Money customers owe (good debts)" />
            {options.includeReceivables && (
              <Field label="Override amount" className="mt-2" hint="Leave empty to use all customer balances">
                <MoneyInput value={options.receivablesOverride} onChange={(v) => set('receivablesOverride', v)} placeholder="auto" />
              </Field>
            )}
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <Checkbox checked={options.deductPayables} onChange={(v) => set('deductPayables', v)} label="Deduct supplier payables" />
            <Field label="Other liabilities to deduct" className="mt-2">
              <MoneyInput value={options.otherLiabilities} onChange={(v) => set('otherLiabilities', v)} />
            </Field>
          </div>
          <Field label="Other zakatable assets">
            <MoneyInput value={options.otherAssets} onChange={(v) => set('otherAssets', v)} />
          </Field>
          <Field label="Nisab value (Rs)" hint="Current value of 52.5 tola silver or 7.5 tola gold">
            <MoneyInput value={options.nisabValue ?? settings.data?.zakat.nisabValue ?? null} onChange={(v) => set('nisabValue', v)} />
          </Field>
          <Field label="Zakat rate (%)">
            <Input type="number" step="0.01" value={options.rate} onChange={(e) => set('rate', Number(e.target.value))} />
          </Field>
          <Field label="Exclude categories" hint="Items you do not treat as stock-in-trade">
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {categories.data?.map((c) => (
                <Checkbox
                  key={c.id}
                  checked={options.excludeCategoryIds.includes(c.id)}
                  onChange={(v) => set('excludeCategoryIds', v ? [...options.excludeCategoryIds, c.id] : options.excludeCategoryIds.filter((x) => x !== c.id))}
                  label={c.name}
                />
              ))}
            </div>
          </Field>
          <Field label="Notes">
            <Textarea rows={2} value={options.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="space-y-4 xl:col-span-2">
        {!data ? (
          <Spinner label="Calculating…" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Zakatable stock" value={money(data.stockValue)} hint={`${data.lines.length} product(s)`} />
              <StatCard label="Cash + receivables" value={money(data.cashValue + data.receivablesValue)} hint={`Cash ${money(data.cashValue)} · Receivable ${money(data.receivablesValue)}`} />
              <StatCard label="Net zakatable wealth" value={money(data.netZakatable)} hint={`Less liabilities ${money(data.liabilities)}`} />
              <StatCard
                label={`Zakat payable (${percent(data.rate)})`}
                value={money(data.zakatPayable)}
                tone={data.meetsNisab ? 'good' : 'default'}
                hint={data.meetsNisab ? 'Above nisab' : 'Below nisab — no zakat due'}
              />
            </div>
            <Card
              title="Calculation"
              actions={
                <>
                  <Button size="sm" icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate()}>
                    Save & print report
                  </Button>
                  <Button
                    size="sm"
                    icon={<Printer className="h-4 w-4" />}
                    onClick={() =>
                      downloadCsv('zakat-stock.csv', [
                        ['SKU', 'Product', 'Category', 'Quantity', 'Unit', 'Rate', 'Value'],
                        ...data.lines.map((l) => [l.sku, l.productName, l.categoryName, l.qty, l.unitSymbol, csvMoney(l.rate), csvMoney(l.value)]),
                      ])
                    }
                  >
                    CSV
                  </Button>
                </>
              }
            >
              <KeyValue label="Stock in trade" value={money(data.stockValue)} />
              <KeyValue label="Cash in hand & bank" value={money(data.cashValue)} />
              <KeyValue label="Receivables (good debts)" value={money(data.receivablesValue)} />
              <KeyValue label="Other assets" value={money(data.otherAssets)} />
              <KeyValue label="Less liabilities" value={`-${money(data.liabilities)}`} />
              <KeyValue label={<span className="font-semibold">Net zakatable wealth</span>} value={<span className="text-lg">{money(data.netZakatable)}</span>} />
              <KeyValue label="Nisab threshold" value={data.nisabValue ? money(data.nisabValue) : 'Not set'} />
              <KeyValue label={<span className="font-semibold">Zakat payable</span>} value={<span className="text-xl font-bold text-emerald-700">{money(data.zakatPayable)}</span>} />
              <p className="mt-3 text-xs text-slate-500">
                This calculator follows the common method for trading businesses: stock in trade at market value, plus cash and recoverable debts, minus short-term liabilities, at {percent(data.rate)}. Please confirm the
                treatment of your specific assets with a qualified scholar.
              </p>
            </Card>
            <Card title="Category summary" bodyClassName="p-0">
              <TableWrap>
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="num">Products</th>
                      <th className="num">Value</th>
                      <th>Included</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.categories.map((c) => (
                      <tr key={c.categoryId}>
                        <td>{c.categoryName}</td>
                        <td className="num">{c.itemCount}</td>
                        <td className="num">{money(c.value)}</td>
                        <td>{c.included ? <Badge color="green">Included</Badge> : <Badge>Excluded</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
            <Card title="Stock detail" bodyClassName="p-0">
              <TableWrap>
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th className="num">Quantity</th>
                      <th className="num">Rate</th>
                      <th className="num">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr key={l.productId}>
                        <td className="font-medium">{l.productName}</td>
                        <td className="text-slate-600">{l.categoryName}</td>
                        <td className="num">{qty(l.qty, l.unitSymbol)}</td>
                        <td className="num">{money(l.rate)}</td>
                        <td className="num font-medium">{money(l.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function HistoryTab() {
  const { data, isLoading } = useQuery({ queryKey: ['zakat', 'reports'], queryFn: () => api.get<Paginated<ZakatReport>>('/zakat/reports', { pageSize: 50 }) });
  if (isLoading) return <Spinner />;
  if (!data?.data.length) return <EmptyState icon={<Calculator className="h-8 w-8" />} title="No saved zakat reports" description="Calculate and save a report to keep a record of the stock and values at that time." />;
  return (
    <Card bodyClassName="p-0">
      <TableWrap>
        <table className="table-base">
          <thead>
            <tr>
              <th>Date</th>
              <th>Basis</th>
              <th className="num">Stock</th>
              <th className="num">Cash</th>
              <th className="num">Receivables</th>
              <th className="num">Liabilities</th>
              <th className="num">Net wealth</th>
              <th className="num">Zakat</th>
              <th>By</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.data.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{dateTimeLabel(r.reportDate)}</td>
                <td className="capitalize">{r.valuationBasis}</td>
                <td className="num">{money(r.stockValue)}</td>
                <td className="num">{money(r.cashValue)}</td>
                <td className="num">{money(r.receivablesValue)}</td>
                <td className="num">{money(r.liabilities)}</td>
                <td className="num font-medium">{money(r.netZakatable)}</td>
                <td className="num font-semibold text-emerald-700">{money(r.zakatPayable)}</td>
                <td className="text-slate-600">{r.createdByName}</td>
                <td>
                  <Button size="xs" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.open(`/print/zakat/${r.id}`, '_blank', 'noopener')}>
                    Print
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

export function ZakatPage() {
  const [tab, setTab] = useState<'calculator' | 'history'>('calculator');
  return (
    <div>
      <PageHeader title="Zakat" subtitle="Calculate zakat on stock in trade, cash and receivables — and keep a dated record" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'calculator', label: 'Calculator' },
          { value: 'history', label: 'Saved reports' },
        ]}
      />
      {tab === 'calculator' ? <CalculatorTab /> : <HistoryTab />}
    </div>
  );
}
