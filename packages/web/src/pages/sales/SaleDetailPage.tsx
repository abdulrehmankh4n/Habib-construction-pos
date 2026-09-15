import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Printer, RefreshCw, RotateCcw, Truck, XCircle } from 'lucide-react';
import { DELIVERY_STATUSES, DELIVERY_STATUS_LABELS, PAYMENT_METHOD_LABELS, REFUND_METHOD_LABELS, type DeliveryStatus, type Sale } from '@pos/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dateTimeLabel, money, qty } from '../../lib/format';
import { printUrl } from '../../lib/print';
import { Badge, Button, Card, ConfirmDialog, Field, Input, KeyValue, Modal, PageHeader, Select, Spinner, TableWrap } from '../../components/ui';
import { SendMessageButtons } from '../../components/SendMessage';
import { ReturnModal } from './ReturnModal';
import { SaleStatusBadges } from './SalesPage';

export function DeliveryModal({ sale, open, onClose }: { sale: Sale; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    status: (sale.deliveryStatus ?? 'pending') as DeliveryStatus,
    address: sale.deliveryAddress ?? '',
    vehicleNo: sale.vehicleNo ?? '',
    driverName: sale.driverName ?? '',
    driverPhone: sale.driverPhone ?? '',
  });
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/sales/${sale.id}/delivery`, {
        ...form,
        address: form.address || null,
        vehicleNo: form.vehicleNo || null,
        driverName: form.driverName || null,
        driverPhone: form.driverPhone || null,
      }),
    onSuccess: () => {
      toast.success('Delivery updated');
      qc.invalidateQueries({ queryKey: ['sales'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delivery details"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DeliveryStatus })}>
            {DELIVERY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DELIVERY_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vehicle no.">
          <Input value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field label="Driver name">
          <Input value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
        </Field>
        <Field label="Driver phone">
          <Input value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

export function SaleDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [voidOpen, setVoidOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const { data: sale, isLoading } = useQuery({ queryKey: ['sales', 'detail', id], queryFn: () => api.get<Sale>(`/sales/${id}`) });

  const voidSale = useMutation({
    mutationFn: (reason: string) => api.post<Sale>(`/sales/${id}/void`, { reason }),
    onSuccess: () => {
      toast.success('Sale cancelled, stock restored');
      setVoidOpen(false);
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const fbrSync = useMutation({
    mutationFn: () => api.post<Sale>(`/sales/${id}/fbr-sync`),
    onSuccess: (s) => {
      if (s.fbrStatus === 'synced') toast.success(`FBR invoice ${s.fbrInvoiceNo}`);
      else toast.error(s.fbrError ?? 'FBR sync failed');
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !sale) return <Spinner />;
  const active = sale.status === 'completed';
  const canReturn = active && can('sales.return') && (sale.items ?? []).some((i) => i.qty > i.returnedQty);

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Invoice {sale.invoiceNo} <SaleStatusBadges sale={sale} />
          </span>
        }
        subtitle={`${dateTimeLabel(sale.saleDate)} · by ${sale.createdByName}`}
        actions={
          <>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => printUrl(`/print/sale/${sale.id}?format=thermal80`)}>
              Receipt
            </Button>
            <Button icon={<FileText className="h-4 w-4" />} onClick={() => printUrl(`/print/sale/${sale.id}?format=a4`)}>
              A4 invoice
            </Button>
            {sale.deliveryRequired && (
              <Button icon={<Truck className="h-4 w-4" />} onClick={() => printUrl(`/print/sale/${sale.id}?format=challan`)}>
                Challan
              </Button>
            )}
            <SendMessageButtons type="sale" id={sale.id} size="md" />
            {canReturn && (
              <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => setReturnOpen(true)}>
                Return items
              </Button>
            )}
            {active && can('sales.void') && !sale.returns?.length && (
              <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => setVoidOpen(true)}>
                Cancel sale
              </Button>
            )}
          </>
        }
      />

      {sale.status === 'void' && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Cancelled on {dateTimeLabel(sale.voidedAt)} — {sale.voidReason}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Items" className="xl:col-span-2" bodyClassName="p-0">
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Discount</th>
                  {sale.taxTotal > 0 && <th className="num">GST</th>}
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sale.items?.map((i, idx) => (
                  <tr key={i.id}>
                    <td className="text-slate-400">{idx + 1}</td>
                    <td>
                      <Link to={`/products/${i.productId}`} className="font-medium hover:underline">
                        {i.productName}
                      </Link>
                      {i.returnedQty > 0 && <p className="text-xs text-violet-700">Returned: {qty(i.returnedQty, i.unitName)}</p>}
                    </td>
                    <td className="num whitespace-nowrap">{qty(i.qty, i.unitName)}</td>
                    <td className="num">{money(i.unitPrice)}</td>
                    <td className="num">{i.discount + i.billDiscountShare > 0 ? money(i.discount + i.billDiscountShare) : '—'}</td>
                    {sale.taxTotal > 0 && <td className="num text-slate-500">{money(i.taxAmount)}</td>}
                    <td className="num font-medium">{money(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        <div className="space-y-4">
          <Card title="Summary">
            <KeyValue label="Subtotal" value={money(sale.subtotal)} />
            {sale.itemDiscount + sale.billDiscount > 0 && <KeyValue label="Discount" value={`-${money(sale.itemDiscount + sale.billDiscount)}`} />}
            {sale.taxTotal > 0 && <KeyValue label={`GST ${sale.pricesIncludeTax ? '(included)' : ''}`} value={money(sale.taxTotal)} />}
            {sale.deliveryCharges > 0 && <KeyValue label="Delivery charges" value={money(sale.deliveryCharges)} />}
            {sale.labourCharges > 0 && <KeyValue label="Labour charges" value={money(sale.labourCharges)} />}
            {sale.roundOff !== 0 && <KeyValue label="Round off" value={money(sale.roundOff)} />}
            <KeyValue label={<span className="font-semibold text-slate-800">Grand total</span>} value={<span className="text-lg">{money(sale.grandTotal)}</span>} />
            <KeyValue label="Paid" value={money(sale.paidAmount)} />
            {sale.balanceDue > 0 && <KeyValue label="Credit (udhaar)" value={<span className="text-amber-700">{money(sale.balanceDue)}</span>} />}
            {sale.changeDue > 0 && <KeyValue label="Change given" value={money(sale.changeDue)} />}
            {sale.costTotal !== undefined && active && (
              <KeyValue label="Gross profit" value={money(sale.grandTotal - sale.taxTotal - sale.costTotal)} className="border-t border-dashed border-slate-200 pt-2" />
            )}
          </Card>

          <Card title="Customer">
            {sale.customerId ? (
              <>
                <Link to={`/customers/${sale.customerId}`} className="font-medium text-brand-700 hover:underline">
                  {sale.customerName}
                </Link>
                <p className="text-sm text-slate-500">{sale.customerPhone}</p>
                <KeyValue label="Current khata balance" value={money(sale.customerBalance)} className="mt-2" />
              </>
            ) : (
              <p className="text-sm text-slate-600">
                {sale.customerName ?? 'Walk-in customer'} {sale.customerPhone && `· ${sale.customerPhone}`}
              </p>
            )}
          </Card>

          {sale.deliveryRequired && (
            <Card
              title="Delivery"
              actions={
                can('deliveries.manage') && active ? (
                  <Button size="xs" onClick={() => setDeliveryOpen(true)}>
                    Update
                  </Button>
                ) : null
              }
            >
              <KeyValue label="Status" value={<Badge color={sale.deliveryStatus === 'delivered' ? 'green' : 'blue'}>{DELIVERY_STATUS_LABELS[sale.deliveryStatus ?? 'pending']}</Badge>} />
              <KeyValue label="Address" value={sale.deliveryAddress ?? '—'} />
              <KeyValue label="Vehicle" value={sale.vehicleNo ?? '—'} />
              <KeyValue label="Driver" value={[sale.driverName, sale.driverPhone].filter(Boolean).join(' · ') || '—'} />
              {sale.deliveredAt && <KeyValue label="Delivered at" value={dateTimeLabel(sale.deliveredAt)} />}
            </Card>
          )}

          {sale.fbrStatus !== 'not_applicable' && (
            <Card
              title="FBR"
              actions={
                sale.fbrStatus !== 'synced' && active && can('sales.void') ? (
                  <Button size="xs" icon={<RefreshCw className="h-3 w-3" />} loading={fbrSync.isPending} onClick={() => fbrSync.mutate()}>
                    Retry
                  </Button>
                ) : null
              }
            >
              <KeyValue label="Status" value={sale.fbrStatus} />
              {sale.fbrInvoiceNo && <KeyValue label="FBR invoice no." value={sale.fbrInvoiceNo} />}
              {sale.fbrError && <p className="mt-1 text-xs text-red-600">{sale.fbrError}</p>}
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Payments" bodyClassName="p-0">
          {!sale.payments?.length ? (
            <p className="px-4 py-3 text-sm text-slate-500">No payment received at the time of sale.</p>
          ) : (
            <table className="table-base">
              <tbody>
                {sale.payments.map((p) => (
                  <tr key={p.id} className={p.isVoid ? 'line-through opacity-60' : undefined}>
                    <td className="font-mono text-xs">{p.paymentNo}</td>
                    <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                    <td className="text-xs text-slate-500">{p.reference}</td>
                    <td>{p.direction === 'out' ? <Badge color="violet">Refund</Badge> : null}</td>
                    <td className="num font-medium">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Returns" bodyClassName="p-0">
          {!sale.returns?.length ? (
            <p className="px-4 py-3 text-sm text-slate-500">No returns against this invoice.</p>
          ) : (
            <table className="table-base">
              <tbody>
                {sale.returns.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => printUrl(`/print/return/${r.id}`)}>
                        {r.returnNo}
                      </button>
                    </td>
                    <td className="text-slate-600">{dateTimeLabel(r.returnDate)}</td>
                    <td>{REFUND_METHOD_LABELS[r.refundMethod]}</td>
                    <td className="num font-medium">{money(r.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      {sale.notes && (
        <Card title="Notes">
          <p className="whitespace-pre-wrap text-sm text-slate-700">{sale.notes}</p>
        </Card>
      )}

      <ConfirmDialog
        open={voidOpen}
        title={`Cancel invoice ${sale.invoiceNo}?`}
        message="Stock will be restored, payments reversed and the customer's khata adjusted. This cannot be undone."
        confirmLabel="Cancel sale"
        danger
        requireReason
        loading={voidSale.isPending}
        onClose={() => setVoidOpen(false)}
        onConfirm={(reason) => voidSale.mutate(reason)}
      />
      <ReturnModal sale={sale} open={returnOpen} onClose={() => setReturnOpen(false)} />
      {deliveryOpen && <DeliveryModal sale={sale} open onClose={() => setDeliveryOpen(false)} />}
    </div>
  );
}
