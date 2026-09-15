import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Truck } from 'lucide-react';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod, type Totals } from '@pos/shared';
import { money } from '../../lib/format';
import { Button, Checkbox, Field, Input, KeyValue, Modal, MoneyInput, Select, Textarea } from '../../components/ui';
import type { CartState, DeliveryInfo } from './cart';

export interface PaymentRow {
  method: PaymentMethod;
  amount: number | null;
  reference: string;
}

export function PaymentModal({
  open,
  onClose,
  totals,
  cart,
  allowCredit,
  onDeliveryChange,
  onNotesChange,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  totals: Totals;
  cart: CartState;
  allowCredit: boolean;
  onDeliveryChange: (d: DeliveryInfo) => void;
  onNotesChange: (notes: string) => void;
  onSubmit: (payments: { method: PaymentMethod; amount: number; reference: string | null }[]) => void;
  submitting: boolean;
}) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setRows([{ method: 'cash', amount: totals.grandTotal, reference: '' }]);
      setTimeout(() => firstRef.current?.select(), 60);
    }
  }, [open, totals.grandTotal]);

  const tendered = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const cashTendered = rows.filter((r) => r.method === 'cash').reduce((s, r) => s + (r.amount ?? 0), 0);
  const change = Math.max(0, tendered - totals.grandTotal);
  const remaining = Math.max(0, totals.grandTotal - tendered);
  const registered = !!cart.customer;

  const problem = useMemo(() => {
    if (change > cashTendered) return 'Only cash payments can exceed the bill (to give change).';
    if (remaining > 0 && !registered) return 'Payment is short. Select a registered customer to record the balance as credit (udhaar).';
    if (remaining > 0 && !allowCredit) return 'Credit sales are disabled in settings.';
    return null;
  }, [change, cashTendered, remaining, registered, allowCredit]);

  const update = (i: number, patch: Partial<PaymentRow>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = () => {
    if (problem || submitting) return;
    onSubmit(
      rows
        .filter((r) => (r.amount ?? 0) > 0)
        .map((r) => ({ method: r.method, amount: r.amount ?? 0, reference: r.reference.trim() || null })),
    );
  };

  const roundUp = (step: number) => Math.ceil(totals.grandTotal / step) * step;
  const quickAmounts = [...new Set([totals.grandTotal, roundUp(10000), roundUp(50000), roundUp(100000), roundUp(500000)])]
    .filter((a) => a > 0)
    .slice(0, 5);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receive payment"
      size="lg"
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose}>Back to cart</Button>
          <Button variant="success" size="lg" loading={submitting} disabled={!!problem} onClick={submit}>
            Complete sale (Enter)
          </Button>
        </>
      }
    >
      <div
        className="grid gap-5 md:grid-cols-5"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className="space-y-4 md:col-span-3">
          <div className="rounded-lg bg-slate-900 px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-wide text-slate-300">Amount payable</p>
            <p className="text-3xl font-semibold">{money(totals.grandTotal)}</p>
            <p className="mt-1 text-xs text-slate-300">
              {cart.customer ? cart.customer.name : cart.walkInName || 'Walk-in customer'}
              {cart.customer && cart.customer.balance !== 0 && ` · previous balance ${money(cart.customer.balance)}`}
            </p>
          </div>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 p-2">
                <Field label={i === 0 ? 'Method' : undefined} className="w-40">
                  <Select value={r.method} onChange={(e) => update(i, { method: e.target.value as PaymentMethod })}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={i === 0 ? 'Amount' : undefined} className="w-36 flex-1">
                  <MoneyInput ref={i === 0 ? firstRef : undefined} value={r.amount} onChange={(v) => update(i, { amount: v })} />
                </Field>
                {r.method !== 'cash' && (
                  <Field label={i === 0 ? 'Reference / Txn ID' : undefined} className="w-40 flex-1">
                    <Input value={r.reference} onChange={(e) => update(i, { reference: e.target.value })} placeholder={r.method === 'cheque' ? 'Cheque no.' : 'Txn ID'} />
                  </Field>
                )}
                {rows.length > 1 && (
                  <Button variant="ghost" size="sm" aria-label="Remove payment" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setRows((rs) => [...rs, { method: 'bank_transfer', amount: remaining || null, reference: '' }])}>
                Split payment
              </Button>
              <span className="text-xs text-slate-400">Quick cash:</span>
              {quickAmounts.map((a) => (
                <Button key={a} size="xs" onClick={() => setRows((rs) => rs.map((r, idx) => (idx === 0 ? { ...r, method: 'cash', amount: a } : r)))}>
                  {money(a)}
                </Button>
              ))}
              {registered && allowCredit && (
                <Button size="xs" variant="outline" onClick={() => setRows([{ method: 'cash', amount: 0, reference: '' }])}>
                  Full credit (udhaar)
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-md border border-slate-200">
            <div className="flex items-center justify-between px-3 py-2">
              <Checkbox
                checked={cart.delivery.required}
                onChange={(v) => onDeliveryChange({ ...cart.delivery, required: v })}
                label={
                  <span className="flex items-center gap-1.5">
                    <Truck className="h-4 w-4" /> Delivery required
                  </span>
                }
              />
            </div>
            {cart.delivery.required && (
              <div className="grid gap-2 border-t border-slate-200 p-3 sm:grid-cols-2">
                <Field label="Delivery address" className="sm:col-span-2">
                  <Input value={cart.delivery.address} onChange={(e) => onDeliveryChange({ ...cart.delivery, address: e.target.value })} placeholder="Site address" />
                </Field>
                <Field label="Vehicle no.">
                  <Input value={cart.delivery.vehicleNo} onChange={(e) => onDeliveryChange({ ...cart.delivery, vehicleNo: e.target.value.toUpperCase() })} placeholder="LES-1234" />
                </Field>
                <Field label="Driver name">
                  <Input value={cart.delivery.driverName} onChange={(e) => onDeliveryChange({ ...cart.delivery, driverName: e.target.value })} />
                </Field>
                <Field label="Driver phone">
                  <Input value={cart.delivery.driverPhone} onChange={(e) => onDeliveryChange({ ...cart.delivery, driverPhone: e.target.value })} />
                </Field>
              </div>
            )}
          </div>
          <Field label="Notes (printed on invoice)">
            <Textarea rows={2} value={cart.notes} onChange={(e) => onNotesChange(e.target.value)} />
          </Field>
        </div>

        <div className="md:col-span-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <KeyValue label="Bill total" value={money(totals.grandTotal)} />
            <KeyValue label="Tendered" value={money(tendered)} />
            {change > 0 && <KeyValue label="Change to return" value={<span className="text-lg text-emerald-700">{money(change)}</span>} />}
            {remaining > 0 && (
              <KeyValue
                label={registered ? 'To customer account (udhaar)' : 'Short'}
                value={<span className="text-lg text-red-600">{money(remaining)}</span>}
              />
            )}
            {registered && cart.customer && (
              <>
                <hr className="my-2 border-slate-200" />
                <KeyValue label="Previous balance" value={money(cart.customer.balance)} />
                <KeyValue label="New balance" value={<span className="font-semibold">{money(cart.customer.balance + remaining)}</span>} />
                {cart.customer.creditLimit !== null && (
                  <KeyValue label="Credit limit" value={money(cart.customer.creditLimit)} />
                )}
              </>
            )}
          </div>
          {problem && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
        </div>
      </div>
    </Modal>
  );
}
