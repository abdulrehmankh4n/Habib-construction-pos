import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PAYMENT_METHODS, REFUND_METHOD_LABELS, proportional, roundQty, type RefundMethod, type Sale, type SaleReturn } from '@pos/shared';
import { api, errorMessage } from '../../lib/api';
import { money, qty } from '../../lib/format';
import { printUrl } from '../../lib/print';
import { Button, Checkbox, Field, Input, Modal, QtyInput, Select } from '../../components/ui';

export function ReturnModal({ sale, open, onClose }: { sale: Sale; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<Record<number, { qty: number | null; restock: boolean }>>({});
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('cash');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setLines({});
    setReason('');
    setRefundMethod(sale.customerId && (sale.customerBalance ?? 0) > 0 ? 'account' : 'cash');
  }, [open, sale]);

  const items = (sale.items ?? []).map((i) => ({ ...i, available: roundQty(i.qty - i.returnedQty) }));
  const selected = items.filter((i) => (lines[i.id]?.qty ?? 0) > 0);
  const estimate = selected.reduce((s, i) => s + proportional(i.lineTotal, lines[i.id]!.qty ?? 0, i.qty), 0);

  const submit = useMutation({
    mutationFn: () =>
      api.post<SaleReturn>(`/sales/${sale.id}/returns`, {
        items: selected.map((i) => ({ saleItemId: i.id, qty: lines[i.id]!.qty, restock: lines[i.id]!.restock })),
        refundMethod,
        reason: reason || null,
      }),
    onSuccess: (r) => {
      toast.success(`Return ${r.returnNo} recorded`);
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      printUrl(`/print/return/${r.id}`);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const invalid = selected.some((i) => (lines[i.id]!.qty ?? 0) > i.available);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Return items — ${sale.invoiceNo}`}
      size="xl"
      footer={
        <>
          <span className="mr-auto self-center text-sm text-slate-600">
            Return value: <span className="font-semibold text-slate-900">{money(estimate)}</span>
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!selected.length || invalid} loading={submit.isPending} onClick={() => submit.mutate()}>
            Record return
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Sold</th>
                <th className="num">Returnable</th>
                <th className="w-32">Return qty</th>
                <th>Back to stock</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const l = lines[i.id] ?? { qty: null, restock: true };
                const over = (l.qty ?? 0) > i.available;
                return (
                  <tr key={i.id}>
                    <td>
                      <p className="font-medium">{i.productName}</p>
                      <p className="text-xs text-slate-500">@ {money(i.unitPrice)} / {i.unitName}</p>
                    </td>
                    <td className="num">{qty(i.qty, i.unitName)}</td>
                    <td className="num">{qty(i.available)}</td>
                    <td>
                      <div className="flex gap-1">
                        <QtyInput
                          className={over ? 'border-red-400' : undefined}
                          value={l.qty}
                          disabled={i.available <= 0}
                          onChange={(v) => setLines((s) => ({ ...s, [i.id]: { ...l, qty: v } }))}
                        />
                        <Button size="sm" variant="ghost" disabled={i.available <= 0} onClick={() => setLines((s) => ({ ...s, [i.id]: { ...l, qty: i.available } }))}>
                          All
                        </Button>
                      </div>
                    </td>
                    <td>
                      <Checkbox checked={l.restock} onChange={(v) => setLines((s) => ({ ...s, [i.id]: { ...l, restock: v } }))} label={l.restock ? 'Yes' : 'Damaged'} />
                    </td>
                    <td className="num">{l.qty ? money(proportional(i.lineTotal, l.qty, i.qty)) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Refund method" hint={refundMethod === 'account' ? 'Amount will be credited to the customer khata' : 'Money will be paid back to the customer'}>
            <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as RefundMethod)}>
              {sale.customerId && <option value="account">{REFUND_METHOD_LABELS.account}</option>}
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {REFUND_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. extra material, broken tiles" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
