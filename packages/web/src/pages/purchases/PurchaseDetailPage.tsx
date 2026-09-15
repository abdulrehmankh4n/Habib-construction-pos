import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Printer, RotateCcw, XCircle } from 'lucide-react';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, REFUND_METHOD_LABELS, proportional, roundQty, type Purchase, type RefundMethod } from '@pos/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dateLabel, dateTimeLabel, money, qty } from '../../lib/format';
import { Badge, Button, Card, ConfirmDialog, Field, Input, KeyValue, Modal, PageHeader, QtyInput, Select, Spinner, TableWrap } from '../../components/ui';

function PurchaseReturnModal({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<Record<number, number | null>>({});
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('account');
  const [reason, setReason] = useState('');
  const items = (purchase.items ?? []).map((i) => ({ ...i, available: roundQty(i.qty - i.returnedQty) }));
  const selected = items.filter((i) => (lines[i.id] ?? 0) > 0);
  const total = selected.reduce((s, i) => s + proportional(i.lineTotal, lines[i.id] ?? 0, i.qty), 0);
  const save = useMutation({
    mutationFn: () =>
      api.post(`/purchases/${purchase.id}/returns`, {
        items: selected.map((i) => ({ purchaseItemId: i.id, qty: lines[i.id] })),
        refundMethod,
        reason: reason || null,
      }),
    onSuccess: () => {
      toast.success('Purchase return recorded');
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Return to supplier — ${purchase.purchaseNo}`}
      size="lg"
      footer={
        <>
          <span className="mr-auto self-center text-sm">
            Return value: <span className="font-semibold">{money(total)}</span>
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!selected.length || selected.some((i) => (lines[i.id] ?? 0) > i.available)} loading={save.isPending} onClick={() => save.mutate()}>
            Record return
          </Button>
        </>
      }
    >
      <table className="table-base">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Received</th>
            <th className="num">Returnable</th>
            <th className="w-32">Return qty</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.productName}</td>
              <td className="num">{qty(i.qty, i.unitName)}</td>
              <td className="num">{qty(i.available)}</td>
              <td>
                <QtyInput value={lines[i.id] ?? null} disabled={i.available <= 0} onChange={(v) => setLines((s) => ({ ...s, [i.id]: v }))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Settlement">
          <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as RefundMethod)}>
            <option value="account">Reduce supplier payable</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                Refund received — {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function PurchaseDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [returnOpen, setReturnOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const { data: p, isLoading } = useQuery({ queryKey: ['purchases', 'detail', id], queryFn: () => api.get<Purchase>(`/purchases/${id}`) });
  const voidMut = useMutation({
    mutationFn: (reason: string) => api.post(`/purchases/${id}/void`, { reason }),
    onSuccess: () => {
      toast.success('Purchase cancelled');
      setVoidOpen(false);
      qc.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !p) return <Spinner />;
  const active = p.status === 'completed';
  const manage = can('purchases.manage');

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Purchase {p.purchaseNo} {p.status === 'void' && <Badge color="red">Cancelled</Badge>}
          </span>
        }
        subtitle={`${dateLabel(p.purchaseDate)} · ${p.supplierName}${p.supplierInvoiceNo ? ` · Bill #${p.supplierInvoiceNo}` : ''} · by ${p.createdByName}`}
        actions={
          <>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print
            </Button>
            {active && manage && (
              <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => setReturnOpen(true)}>
                Return to supplier
              </Button>
            )}
            {active && manage && !p.returns?.length && (
              <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => setVoidOpen(true)}>
                Cancel
              </Button>
            )}
          </>
        }
      />
      {p.status === 'void' && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          Cancelled on {dateTimeLabel(p.voidedAt)} — {p.voidReason}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Items received" className="xl:col-span-2" bodyClassName="p-0">
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Cost</th>
                  <th className="num">Discount</th>
                  <th className="num">Amount</th>
                  <th className="num">Landed / base</th>
                </tr>
              </thead>
              <tbody>
                {p.items?.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link to={`/products/${i.productId}`} className="font-medium hover:underline">
                        {i.productName}
                      </Link>
                      {i.returnedQty > 0 && <p className="text-xs text-violet-700">Returned {qty(i.returnedQty, i.unitName)}</p>}
                    </td>
                    <td className="num">{qty(i.qty, i.unitName)}</td>
                    <td className="num">{money(i.unitCost)}</td>
                    <td className="num">{i.discount ? money(i.discount) : '—'}</td>
                    <td className="num font-medium">{money(i.lineTotal)}</td>
                    <td className="num text-slate-600">{money(i.landedUnitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card title="Summary">
          <KeyValue label="Supplier" value={<Link className="text-brand-700 hover:underline" to={`/suppliers/${p.supplierId}`}>{p.supplierName}</Link>} />
          {p.vehicleNo && <KeyValue label="Vehicle" value={p.vehicleNo} />}
          <hr className="my-2 border-slate-200" />
          <KeyValue label="Items total" value={money(p.subtotal - p.itemDiscount)} />
          {p.billDiscount > 0 && <KeyValue label="Bill discount" value={`-${money(p.billDiscount)}`} />}
          {p.freightCharges > 0 && <KeyValue label="Freight" value={money(p.freightCharges)} />}
          {p.otherCharges > 0 && <KeyValue label="Other charges" value={money(p.otherCharges)} />}
          {p.taxAmount > 0 && <KeyValue label="Input GST" value={money(p.taxAmount)} />}
          <KeyValue label={<span className="font-semibold">Total</span>} value={<span className="text-lg">{money(p.grandTotal)}</span>} />
          <KeyValue label="Paid" value={money(p.paidAmount)} />
          {p.returnedTotal > 0 && <KeyValue label="Returned" value={money(p.returnedTotal)} />}
          {p.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{p.notes}</p>}
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Payments" bodyClassName="p-0">
          {!p.payments?.length ? (
            <p className="px-4 py-3 text-sm text-slate-500">No payments linked to this purchase.</p>
          ) : (
            <table className="table-base">
              <tbody>
                {p.payments.map((pay) => (
                  <tr key={pay.id} className={pay.isVoid ? 'line-through opacity-60' : undefined}>
                    <td className="font-mono text-xs">{pay.paymentNo}</td>
                    <td>{PAYMENT_METHOD_LABELS[pay.method]}</td>
                    <td>{pay.direction === 'in' ? <Badge color="violet">Refund received</Badge> : null}</td>
                    <td className="num">{money(pay.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Returns to supplier" bodyClassName="p-0">
          {!p.returns?.length ? (
            <p className="px-4 py-3 text-sm text-slate-500">No returns.</p>
          ) : (
            <table className="table-base">
              <tbody>
                {p.returns.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs">{r.returnNo}</td>
                    <td className="text-slate-600">{dateTimeLabel(r.returnDate)}</td>
                    <td>{REFUND_METHOD_LABELS[r.refundMethod]}</td>
                    <td className="num">{money(r.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      {returnOpen && <PurchaseReturnModal purchase={p} onClose={() => setReturnOpen(false)} />}
      <ConfirmDialog
        open={voidOpen}
        title={`Cancel purchase ${p.purchaseNo}?`}
        message="Received stock will be removed and the supplier payable reversed."
        confirmLabel="Cancel purchase"
        danger
        requireReason
        loading={voidMut.isPending}
        onClose={() => setVoidOpen(false)}
        onConfirm={(reason) => voidMut.mutate(reason)}
      />
    </div>
  );
}
