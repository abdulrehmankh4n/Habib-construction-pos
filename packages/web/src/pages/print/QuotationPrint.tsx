import { amountInWords, type AppSettings, type Quotation } from '@pos/shared';
import { dateLabel, money, qty } from '../../lib/format';
import { ShopHeader } from './PrintShell';

export function QuotationPrint({ quotation, settings }: { quotation: Quotation; settings: AppSettings }) {
  return (
    <div className="a4-doc text-[10pt]">
      <ShopHeader settings={settings} title="Quotation" />
      <div className="mt-4 flex justify-between gap-6">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Quotation for</p>
          <p className="text-[11pt] font-semibold">{quotation.customerName ?? 'Customer'}</p>
          {quotation.customerAddress && <p className="max-w-xs text-slate-600">{quotation.customerAddress}</p>}
          {quotation.customerPhone && <p className="text-slate-600">{quotation.customerPhone}</p>}
        </div>
        <table className="h-fit text-[10pt]">
          <tbody>
            <tr>
              <td className="pr-3 text-slate-500">Quotation no.</td>
              <td className="font-semibold">{quotation.quotationNo}</td>
            </tr>
            <tr>
              <td className="pr-3 text-slate-500">Date</td>
              <td>{dateLabel(quotation.quotationDate)}</td>
            </tr>
            <tr>
              <td className="pr-3 text-slate-500">Valid until</td>
              <td>{dateLabel(quotation.validUntil)}</td>
            </tr>
            <tr>
              <td className="pr-3 text-slate-500">Prepared by</td>
              <td>{quotation.createdByName}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <table className="mt-4 w-full border-collapse text-[9.5pt]">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1 text-left">#</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Description</th>
            <th className="border border-slate-300 px-2 py-1 text-right">Qty</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Unit</th>
            <th className="border border-slate-300 px-2 py-1 text-right">Rate</th>
            <th className="border border-slate-300 px-2 py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {quotation.items?.map((i, idx) => (
            <tr key={i.id}>
              <td className="border border-slate-300 px-2 py-1">{idx + 1}</td>
              <td className="border border-slate-300 px-2 py-1">
                {i.productName}
                {settings.receipt.showUrduNames && i.urduName && <span className="urdu block text-[10pt] leading-tight">{i.urduName}</span>}
              </td>
              <td className="border border-slate-300 px-2 py-1 text-right">{qty(i.qty)}</td>
              <td className="border border-slate-300 px-2 py-1">{i.unitName}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{money(i.unitPrice)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-medium">{money(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex justify-between gap-6">
        <div className="flex-1 text-[9pt]">
          <p className="font-semibold">Amount in words</p>
          <p className="text-slate-700">{amountInWords(quotation.grandTotal)}</p>
          {quotation.notes && (
            <>
              <p className="mt-2 font-semibold">Notes</p>
              <p className="text-slate-700">{quotation.notes}</p>
            </>
          )}
          <p className="mt-3 font-semibold">Terms</p>
          <p className="max-w-md whitespace-pre-wrap text-slate-600">{settings.quotation.terms}</p>
        </div>
        <table className="w-72 text-[10pt]">
          <tbody>
            <tr>
              <td className="py-0.5 text-slate-600">Subtotal</td>
              <td className="py-0.5 text-right">{money(quotation.subtotal)}</td>
            </tr>
            {quotation.itemDiscount + quotation.billDiscount > 0 && (
              <tr>
                <td className="py-0.5 text-slate-600">Discount</td>
                <td className="py-0.5 text-right">-{money(quotation.itemDiscount + quotation.billDiscount)}</td>
              </tr>
            )}
            {quotation.taxTotal > 0 && (
              <tr>
                <td className="py-0.5 text-slate-600">GST {quotation.pricesIncludeTax ? '(included)' : ''}</td>
                <td className="py-0.5 text-right">{money(quotation.taxTotal)}</td>
              </tr>
            )}
            {quotation.deliveryCharges > 0 && (
              <tr>
                <td className="py-0.5 text-slate-600">Delivery charges</td>
                <td className="py-0.5 text-right">{money(quotation.deliveryCharges)}</td>
              </tr>
            )}
            {quotation.labourCharges > 0 && (
              <tr>
                <td className="py-0.5 text-slate-600">Labour charges</td>
                <td className="py-0.5 text-right">{money(quotation.labourCharges)}</td>
              </tr>
            )}
            <tr className="border-y-2 border-slate-800">
              <td className="py-1 text-[12pt] font-bold">Total</td>
              <td className="py-1 text-right text-[12pt] font-bold">{money(quotation.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-10 text-right text-[9pt]">
        <div className="ml-auto mb-1 h-10 w-44 border-b border-slate-400" />
        For {settings.shop.name}
      </div>
    </div>
  );
}
