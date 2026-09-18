import { QRCodeSVG } from 'qrcode.react';
import { PAYMENT_METHOD_LABELS, amountInWords, type AppSettings, type Sale } from '@pos/shared';
import { dateTimeLabel, money, qty } from '../../lib/format';
import { ShopHeader } from './PrintShell';

export function SaleInvoiceA4({ sale, settings }: { sale: Sale; settings: AppSettings }) {
  const taxed = sale.taxTotal > 0;
  return (
    <div className="a4-doc text-[10pt]">
      <ShopHeader settings={settings} title={taxed ? 'Sales Tax Invoice' : 'Invoice'} />
      <div className="mt-4 flex justify-between gap-6">
        <div className="text-[10pt]">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</p>
          <p className="text-[11pt] font-semibold">{sale.customerName ?? settings.sales.walkInLabel}</p>
          {sale.customerAddress && <p className="max-w-xs text-slate-600">{sale.customerAddress}</p>}
          {sale.customerPhone && <p className="text-slate-600">{sale.customerPhone}</p>}
          {sale.customerNtn && <p className="text-slate-600">NTN: {sale.customerNtn}</p>}
        </div>
        <table className="h-fit text-[10pt]">
          <tbody>
            <tr>
              <td className="pr-3 text-slate-500">Invoice no.</td>
              <td className="font-semibold">{sale.invoiceNo}</td>
            </tr>
            <tr>
              <td className="pr-3 text-slate-500">Date</td>
              <td>{dateTimeLabel(sale.saleDate)}</td>
            </tr>
            <tr>
              <td className="pr-3 text-slate-500">Salesman</td>
              <td>{sale.createdByName}</td>
            </tr>
            {sale.fbrInvoiceNo && (
              <tr>
                <td className="pr-3 text-slate-500">FBR invoice</td>
                <td className="font-mono text-[9pt]">{sale.fbrInvoiceNo}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sale.status === 'void' && <p className="mt-3 border border-red-600 px-3 py-1 text-center font-bold uppercase text-red-600">Cancelled invoice</p>}

      <table className="mt-4 w-full border-collapse text-[9.5pt]">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1 text-left">#</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Description</th>
            {taxed && <th className="border border-slate-300 px-2 py-1 text-left">HS code</th>}
            <th className="border border-slate-300 px-2 py-1 text-right">Qty</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Unit</th>
            <th className="border border-slate-300 px-2 py-1 text-right">Rate</th>
            <th className="border border-slate-300 px-2 py-1 text-right">Discount</th>
            {taxed && <th className="border border-slate-300 px-2 py-1 text-right">GST</th>}
            <th className="border border-slate-300 px-2 py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((i, idx) => (
            <tr key={i.id}>
              <td className="border border-slate-300 px-2 py-1">{idx + 1}</td>
              <td className="border border-slate-300 px-2 py-1">
                {i.productName}
                {settings.receipt.showUrduNames && i.urduName && <span className="urdu block text-[10pt] leading-tight">{i.urduName}</span>}
              </td>
              {taxed && <td className="border border-slate-300 px-2 py-1 text-[8.5pt]">{i.hsCode ?? '-'}</td>}
              <td className="border border-slate-300 px-2 py-1 text-right">{qty(i.qty)}</td>
              <td className="border border-slate-300 px-2 py-1">{i.unitName}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{money(i.unitPrice)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{i.discount + i.billDiscountShare ? money(i.discount + i.billDiscountShare) : '-'}</td>
              {taxed && <td className="border border-slate-300 px-2 py-1 text-right">{money(i.taxAmount)}</td>}
              <td className="border border-slate-300 px-2 py-1 text-right font-medium">{money(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-between gap-6">
        <div className="flex-1 text-[9pt]">
          <p className="font-semibold">Amount in words</p>
          <p className="text-slate-700">{amountInWords(sale.grandTotal)}</p>
          {sale.payments && sale.payments.length > 0 && (
            <>
              <p className="mt-2 font-semibold">Payment</p>
              {sale.payments.filter((p) => !p.isVoid).map((p) => (
                <p key={p.id} className="text-slate-700">
                  {PAYMENT_METHOD_LABELS[p.method]} {money(p.amount)} {p.reference ? `(${p.reference})` : ''}
                </p>
              ))}
            </>
          )}
          {sale.notes && (
            <>
              <p className="mt-2 font-semibold">Notes</p>
              <p className="text-slate-700">{sale.notes}</p>
            </>
          )}
        </div>
        <table className="w-72 text-[10pt]">
          <tbody>
            <tr>
              <td className="py-0.5 text-slate-600">Subtotal</td>
              <td className="py-0.5 text-right">{money(sale.subtotal)}</td>
            </tr>
            {sale.itemDiscount + sale.billDiscount > 0 && (
              <tr>
                <td className="py-0.5 text-slate-600">Discount</td>
                <td className="py-0.5 text-right">-{money(sale.itemDiscount + sale.billDiscount)}</td>
              </tr>
            )}
            {taxed && (
              <tr>
                <td className="py-0.5 text-slate-600">GST {sale.pricesIncludeTax ? '(included)' : ''}</td>
                <td className="py-0.5 text-right">{money(sale.taxTotal)}</td>
              </tr>
            )}
            {sale.deliveryCharges > 0 && (
              <tr>
                <td className="py-0.5 text-slate-600">Delivery charges</td>
                <td className="py-0.5 text-right">{money(sale.deliveryCharges)}</td>
              </tr>
            )}
            {sale.labourCharges > 0 && (
              <tr>
                <td className="py-0.5 text-slate-600">Labour charges</td>
                <td className="py-0.5 text-right">{money(sale.labourCharges)}</td>
              </tr>
            )}
            {sale.roundOff !== 0 && (
              <tr>
                <td className="py-0.5 text-slate-600">Round off</td>
                <td className="py-0.5 text-right">{money(sale.roundOff)}</td>
              </tr>
            )}
            <tr className="border-y-2 border-slate-800">
              <td className="py-1 text-[12pt] font-bold">Grand total</td>
              <td className="py-1 text-right text-[12pt] font-bold">{money(sale.grandTotal)}</td>
            </tr>
            <tr>
              <td className="py-0.5 text-slate-600">Paid</td>
              <td className="py-0.5 text-right">{money(sale.paidAmount)}</td>
            </tr>
            {sale.balanceDue > 0 && (
              <tr>
                <td className="py-0.5 font-semibold">Balance due</td>
                <td className="py-0.5 text-right font-semibold">{money(sale.balanceDue)}</td>
              </tr>
            )}
            {sale.customerId && sale.customerBalance !== null && sale.customerBalance !== undefined && (
              <tr>
                <td className="py-0.5 text-slate-600">Account balance</td>
                <td className="py-0.5 text-right">{money(sale.customerBalance)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-end justify-between gap-6">
        <div className="text-[8.5pt] text-slate-600">
          <p className="font-semibold text-slate-700">Terms and conditions</p>
          <p className="max-w-md whitespace-pre-wrap">{settings.receipt.terms}</p>
          {sale.fbrInvoiceNo && (
            <div className="mt-2 flex items-center gap-2">
              <QRCodeSVG value={sale.fbrInvoiceNo} size={64} level="M" />
              <span>FBR verified invoice</span>
            </div>
          )}
        </div>
        <div className="flex gap-10 text-center text-[9pt]">
          <div>
            <div className="mb-1 h-10 w-36 border-b border-slate-400" />
            Received by
          </div>
          <div>
            <div className="mb-1 h-10 w-36 border-b border-slate-400" />
            For {settings.shop.name}
          </div>
        </div>
      </div>
    </div>
  );
}
