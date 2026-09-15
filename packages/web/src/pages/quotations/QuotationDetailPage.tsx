import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Printer, ShoppingCart, XCircle } from 'lucide-react';
import type { Quotation } from '@pos/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dateLabel, dateTimeLabel, money, qty } from '../../lib/format';
import { printUrl } from '../../lib/print';
import { Button, Card, ConfirmDialog, KeyValue, PageHeader, Spinner, TableWrap } from '../../components/ui';
import { QuotationStatus } from './QuotationsPage';

export function QuotationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const { data: q, isLoading } = useQuery({ queryKey: ['quotations', 'detail', id], queryFn: () => api.get<Quotation>(`/quotations/${id}`) });
  const cancel = useMutation({
    mutationFn: () => api.post(`/quotations/${id}/cancel`),
    onSuccess: () => {
      toast.success('Quotation cancelled');
      setCancelOpen(false);
      qc.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !q) return <Spinner />;
  const open = q.status === 'open';

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Quotation {q.quotationNo} <QuotationStatus q={q} />
          </span>
        }
        subtitle={`${dateTimeLabel(q.quotationDate)} · valid until ${dateLabel(q.validUntil)} · by ${q.createdByName}`}
        actions={
          <>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => printUrl(`/print/quotation/${q.id}`)}>
              Print
            </Button>
            {open && (
              <Button icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/pos?editQuotation=${q.id}`)}>
                Edit
              </Button>
            )}
            {open && can('pos.sell') && (
              <Button variant="success" icon={<ShoppingCart className="h-4 w-4" />} onClick={() => navigate(`/pos?quotation=${q.id}`)}>
                Convert to sale
              </Button>
            )}
            {open && (
              <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>
                Cancel
              </Button>
            )}
          </>
        }
      />
      {q.saleId && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Converted to sale{' '}
          <Link className="font-medium underline" to={`/sales/${q.saleId}`}>
            {q.saleInvoiceNo}
          </Link>
        </p>
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
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {q.items?.map((i, idx) => (
                  <tr key={i.id}>
                    <td className="text-slate-400">{idx + 1}</td>
                    <td className="font-medium">{i.productName}</td>
                    <td className="num">{qty(i.qty, i.unitName)}</td>
                    <td className="num">{money(i.unitPrice)}</td>
                    <td className="num">{i.discount + i.billDiscountShare > 0 ? money(i.discount + i.billDiscountShare) : '—'}</td>
                    <td className="num font-medium">{money(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card title="Summary">
          <KeyValue label="Customer" value={q.customerName ?? '—'} />
          {q.customerPhone && <KeyValue label="Phone" value={q.customerPhone} />}
          <hr className="my-2 border-slate-200" />
          <KeyValue label="Subtotal" value={money(q.subtotal)} />
          {q.itemDiscount + q.billDiscount > 0 && <KeyValue label="Discount" value={`-${money(q.itemDiscount + q.billDiscount)}`} />}
          {q.taxTotal > 0 && <KeyValue label="GST" value={money(q.taxTotal)} />}
          {q.deliveryCharges > 0 && <KeyValue label="Delivery" value={money(q.deliveryCharges)} />}
          {q.labourCharges > 0 && <KeyValue label="Labour" value={money(q.labourCharges)} />}
          <KeyValue label={<span className="font-semibold">Total</span>} value={<span className="text-lg">{money(q.grandTotal)}</span>} />
          {q.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{q.notes}</p>}
        </Card>
      </div>
      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this quotation?"
        message="It will no longer be available for conversion."
        confirmLabel="Cancel quotation"
        danger
        loading={cancel.isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancel.mutate()}
      />
    </div>
  );
}
