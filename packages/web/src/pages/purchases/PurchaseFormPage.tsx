import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, lineGross, resolveUnit, type PaymentMethod, type Product, type Purchase, type Supplier } from '@pos/shared';
import { api, errorMessage } from '../../lib/api';
import { money, qty, today } from '../../lib/format';
import { Button, Card, Field, Input, KeyValue, MoneyInput, PageHeader, QtyInput, Select, TableWrap, Textarea } from '../../components/ui';
import { ProductPicker, SupplierPicker } from '../../components/pickers';

interface Row {
  key: number;
  product: Product | null;
  unitId: number | null;
  qty: number | null;
  unitCost: number | null;
  discount: number | null;
  newSalePrice: number | null;
}

let rowSeq = 1;
const emptyRow = (): Row => ({ key: rowSeq++, product: null, unitId: null, qty: null, unitCost: null, discount: null, newSalePrice: null });

export function PurchaseFormPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [billNo, setBillNo] = useState('');
  const [date, setDate] = useState(today());
  const [vehicleNo, setVehicleNo] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [billDiscount, setBillDiscount] = useState<number | null>(null);
  const [taxAmount, setTaxAmount] = useState<number | null>(null);
  const [freight, setFreight] = useState<number | null>(null);
  const [other, setOther] = useState<number | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [paid, setPaid] = useState<number | null>(null);
  const [payRef, setPayRef] = useState('');
  const [notes, setNotes] = useState('');

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const valid = rows.filter((r) => r.product && r.unitId && r.qty && r.qty > 0 && r.unitCost !== null);
  const subtotal = valid.reduce((s, r) => s + lineGross(r.qty!, r.unitCost!) - (r.discount ?? 0), 0);
  const grand = subtotal - (billDiscount ?? 0) + (taxAmount ?? 0) + (freight ?? 0) + (other ?? 0);
  const payable = grand - (paid ?? 0);

  const landed = useMemo(() => {
    const charges = (freight ?? 0) + (other ?? 0) - (billDiscount ?? 0);
    return (r: Row) => {
      if (!r.product || !r.qty || r.unitCost === null || subtotal <= 0) return null;
      const unit = resolveUnit(r.product, r.unitId ?? r.product.unitId);
      const net = lineGross(r.qty, r.unitCost) - (r.discount ?? 0);
      const share = (charges * net) / subtotal;
      return Math.round((net + share) / (r.qty * (unit?.factor ?? 1)));
    };
  }, [freight, other, billDiscount, subtotal]);

  const save = useMutation({
    mutationFn: () => {
      if (!supplier) throw new Error('Select the supplier');
      if (!valid.length) throw new Error('Add at least one item with quantity and cost');
      if (rows.some((r) => r.product && (!r.qty || r.unitCost === null))) throw new Error('Enter quantity and cost for every item');
      return api.post<Purchase>('/purchases', {
        supplierId: supplier.id,
        supplierInvoiceNo: billNo || null,
        purchaseDate: date,
        vehicleNo: vehicleNo || null,
        items: valid.map((r) => ({
          productId: r.product!.id,
          unitId: r.unitId,
          qty: r.qty,
          unitCost: r.unitCost,
          discount: r.discount ?? 0,
          newSalePrice: r.newSalePrice,
        })),
        billDiscount: billDiscount ?? 0,
        taxAmount: taxAmount ?? 0,
        freightCharges: freight ?? 0,
        otherCharges: other ?? 0,
        notes: notes || null,
        payments: paid ? [{ method: payMethod, amount: paid, reference: payRef || null }] : [],
      });
    },
    onSuccess: (p) => {
      toast.success(`Purchase ${p.purchaseNo} saved — stock updated`);
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      navigate(`/purchases/${p.id}`, { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="New purchase (GRN)"
        subtitle="Receive stock from a supplier. Freight and other charges are added to the landed cost."
        actions={
          <>
            <Button onClick={() => navigate('/purchases')}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              Save purchase
            </Button>
          </>
        }
      />
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Supplier" required className="md:col-span-2">
            <SupplierPicker value={supplier} onChange={setSupplier} autoFocus />
          </Field>
          <Field label="Supplier bill no.">
            <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Vehicle no. (truck / trolley)">
            <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} />
          </Field>
          {supplier && (
            <div className="self-end text-sm text-slate-600 md:col-span-3">
              Current payable to {supplier.name}: <span className="font-semibold">{money(supplier.balance)}</span>
            </div>
          )}
        </div>
      </Card>

      <Card title="Items" bodyClassName="p-0">
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th className="min-w-[18rem]">Product</th>
                <th>Unit</th>
                <th className="w-28">Qty</th>
                <th className="w-32">Cost / unit</th>
                <th className="w-28">Discount</th>
                <th className="num">Amount</th>
                <th className="num">Landed / base</th>
                <th className="w-32">New sale price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const unit = r.product ? resolveUnit(r.product, r.unitId ?? r.product.unitId) : null;
                const amount = r.qty && r.unitCost !== null ? lineGross(r.qty, r.unitCost) - (r.discount ?? 0) : null;
                const l = landed(r);
                return (
                  <tr key={r.key}>
                    <td>
                      <ProductPicker
                        value={r.product}
                        showCost
                        onChange={(p) =>
                          update(r.key, {
                            product: p,
                            unitId: p?.unitId ?? null,
                            unitCost: p ? p.purchasePrice ?? p.costPrice ?? 0 : null,
                          })
                        }
                      />
                      {r.product && (
                        <p className="mt-1 text-xs text-slate-500">
                          In stock: {qty(r.product.stockQty, r.product.unitSymbol)} · Avg cost {money(r.product.costPrice)} · Sale {money(r.product.salePrice)}
                        </p>
                      )}
                    </td>
                    <td>
                      {r.product && r.product.units.length > 0 ? (
                        <Select
                          value={r.unitId ?? r.product.unitId}
                          onChange={(e) => {
                            const unitId = Number(e.target.value);
                            const u = resolveUnit(r.product!, unitId);
                            update(r.key, { unitId, unitCost: Math.round((r.product!.purchasePrice ?? 0) * (u?.factor ?? 1)) });
                          }}
                        >
                          <option value={r.product.unitId}>{r.product.unitSymbol}</option>
                          {r.product.units.map((u) => (
                            <option key={u.unitId} value={u.unitId}>
                              {u.unitSymbol} ({u.factor})
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-sm text-slate-600">{r.product?.unitSymbol ?? '—'}</span>
                      )}
                    </td>
                    <td>
                      <QtyInput value={r.qty} allowDecimal={unit?.allowDecimal ?? true} onChange={(v) => update(r.key, { qty: v })} />
                    </td>
                    <td>
                      <MoneyInput value={r.unitCost} onChange={(v) => update(r.key, { unitCost: v })} />
                    </td>
                    <td>
                      <MoneyInput value={r.discount} onChange={(v) => update(r.key, { discount: v })} />
                    </td>
                    <td className="num font-medium">{amount !== null ? money(amount) : '—'}</td>
                    <td className="num text-slate-600">{l !== null ? money(l) : '—'}</td>
                    <td>
                      <MoneyInput value={r.newSalePrice} onChange={(v) => update(r.key, { newSalePrice: v })} placeholder={r.product ? String(r.product.salePrice / 100) : ''} />
                    </td>
                    <td>
                      <Button size="sm" variant="ghost" aria-label="Remove row" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        <div className="border-t border-slate-100 p-3">
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setRows((rs) => [...rs, emptyRow()])}>
            Add item
          </Button>
          <span className="ml-3 text-xs text-slate-500">"New sale price" is per base unit and updates the product's selling price.</span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Charges & payment">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bill discount">
              <MoneyInput value={billDiscount} onChange={setBillDiscount} />
            </Field>
            <Field label="Freight / kiraya" hint="Added to landed cost">
              <MoneyInput value={freight} onChange={setFreight} />
            </Field>
            <Field label="Other charges (loading etc.)">
              <MoneyInput value={other} onChange={setOther} />
            </Field>
            <Field label="Input GST (as per bill)">
              <MoneyInput value={taxAmount} onChange={setTaxAmount} />
            </Field>
            <Field label="Payment method">
              <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount paid now" hint="Leave empty to add full amount to supplier payable">
              <MoneyInput value={paid} onChange={setPaid} />
            </Field>
            {payMethod !== 'cash' && (
              <Field label="Payment reference">
                <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} />
              </Field>
            )}
            <Field label="Notes" className="sm:col-span-2">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Card>
        <Card title="Summary">
          <KeyValue label="Items total" value={money(subtotal)} />
          {(billDiscount ?? 0) > 0 && <KeyValue label="Bill discount" value={`-${money(billDiscount)}`} />}
          {(freight ?? 0) + (other ?? 0) > 0 && <KeyValue label="Freight & other" value={money((freight ?? 0) + (other ?? 0))} />}
          {(taxAmount ?? 0) > 0 && <KeyValue label="Input GST" value={money(taxAmount)} />}
          <KeyValue label={<span className="font-semibold">Purchase total</span>} value={<span className="text-xl">{money(grand)}</span>} />
          <KeyValue label="Paid now" value={money(paid ?? 0)} />
          <KeyValue label="Added to supplier payable" value={<span className={payable < 0 ? 'text-red-600' : 'text-amber-700'}>{money(payable)}</span>} />
        </Card>
      </div>
    </div>
  );
}
