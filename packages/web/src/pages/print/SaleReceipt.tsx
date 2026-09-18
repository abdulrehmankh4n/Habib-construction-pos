import { QRCodeSVG } from 'qrcode.react';
import { PAYMENT_METHOD_LABELS, type AppSettings, type Sale } from '@pos/shared';
import { dateTimeLabel, money, qty } from '../../lib/format';
import { ShopHeader } from './PrintShell';

export function SaleReceipt({ sale, settings }: { sale: Sale; settings: AppSettings }) {
  const taxed = sale.taxTotal > 0;
  return (
    <div className="slip font-mono">
      <ShopHeader settings={settings} title={taxed ? 'Sales Tax Invoice' : 'Sales Invoice'} compact />
      <div className="mt-1 text-[8pt]">
        <div className="flex justify-between">
          <span>Invoice: {sale.invoiceNo}</span>
          <span>{dateTimeLabel(sale.saleDate)}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer: {sale.customerName ?? settings.sales.walkInLabel}</span>
          <span>{sale.customerPhone}</span>
        </div>
        <div className="flex justify-between">
          <span>Salesman: {sale.createdByName}</span>
          {sale.status === 'void' && <span className="font-bold">CANCELLED</span>}
        </div>
      </div>
      <table className="mt-1 w-full border-y border-dashed border-black text-[8.5pt]">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="py-0.5 text-left">Item</th>
            <th className="py-0.5 text-right">Qty</th>
            <th className="py-0.5 text-right">Rate</th>
            <th className="py-0.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((i) => (
            <tr key={i.id} className="align-top">
              <td className="py-0.5">
                {i.productName}
                {settings.receipt.showUrduNames && i.urduName && <div className="urdu text-[9pt]">{i.urduName}</div>}
                {i.discount + i.billDiscountShare > 0 && <div className="text-[7.5pt]">Disc: {money(i.discount + i.billDiscountShare)}</div>}
              </td>
              <td className="py-0.5 text-right">
                {qty(i.qty)}
                <div className="text-[7pt]">{i.unitName}</div>
              </td>
              <td className="py-0.5 text-right">{money(i.unitPrice)}</td>
              <td className="py-0.5 text-right">{money(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-[9pt]">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(sale.subtotal)}</span>
        </div>
        {sale.itemDiscount + sale.billDiscount > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-{money(sale.itemDiscount + sale.billDiscount)}</span>
          </div>
        )}
        {taxed && (
          <div className="flex justify-between">
            <span>GST {sale.pricesIncludeTax ? '(incl.)' : ''}</span>
            <span>{money(sale.taxTotal)}</span>
          </div>
        )}
        {sale.deliveryCharges > 0 && (
          <div className="flex justify-between">
            <span>Delivery</span>
            <span>{money(sale.deliveryCharges)}</span>
          </div>
        )}
        {sale.labourCharges > 0 && (
          <div className="flex justify-between">
            <span>Labour</span>
            <span>{money(sale.labourCharges)}</span>
          </div>
        )}
        {sale.roundOff !== 0 && (
          <div className="flex justify-between">
            <span>Round off</span>
            <span>{money(sale.roundOff)}</span>
          </div>
        )}
        <div className="mt-0.5 flex justify-between border-y border-black py-0.5 text-[12pt] font-bold">
          <span>TOTAL</span>
          <span>{money(sale.grandTotal)}</span>
        </div>
        {sale.payments?.filter((p) => !p.isVoid && p.direction === 'in').map((p) => (
          <div key={p.id} className="flex justify-between">
            <span>{PAYMENT_METHOD_LABELS[p.method]}</span>
            <span>{money(p.amount)}</span>
          </div>
        ))}
        {sale.changeDue > 0 && (
          <div className="flex justify-between font-bold">
            <span>Change</span>
            <span>{money(sale.changeDue)}</span>
          </div>
        )}
        {sale.balanceDue > 0 && (
          <div className="flex justify-between font-bold">
            <span>Balance (udhaar)</span>
            <span>{money(sale.balanceDue)}</span>
          </div>
        )}
        {sale.customerId && sale.customerBalance !== null && sale.customerBalance !== undefined && (
          <div className="mt-1 border-t border-dashed border-black pt-0.5">
            <div className="flex justify-between">
              <span>Previous balance</span>
              <span>{money(sale.customerBalance - sale.balanceDue)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Total balance</span>
              <span>{money(sale.customerBalance)}</span>
            </div>
          </div>
        )}
      </div>
      {sale.deliveryRequired && (
        <div className="mt-1 border-t border-dashed border-black pt-1 text-[8pt]">
          <p className="font-bold">Delivery</p>
          <p>{sale.deliveryAddress}</p>
          <p>
            {sale.vehicleNo} {sale.driverName} {sale.driverPhone}
          </p>
        </div>
      )}
      {sale.notes && <p className="mt-1 text-[8pt]">Note: {sale.notes}</p>}
      {sale.fbrInvoiceNo && (
        <div className="mt-2 flex items-center justify-center gap-2 border-t border-dashed border-black pt-1">
          <QRCodeSVG value={sale.fbrInvoiceNo} size={56} level="M" />
          <div className="text-[7.5pt]">
            <p className="font-bold">FBR Invoice</p>
            <p>{sale.fbrInvoiceNo}</p>
            <p>Verify on FBR Tax Asaan app</p>
          </div>
        </div>
      )}
      <div className="mt-2 border-t border-dashed border-black pt-1 text-center text-[8pt]">
        <p>{settings.receipt.footer}</p>
        {settings.receipt.urduFooter && <p className="urdu text-[10pt]">{settings.receipt.urduFooter}</p>}
        <p className="mt-1 text-[7pt]">{sale.invoiceNo} · {dateTimeLabel(sale.saleDate)}</p>
      </div>
    </div>
  );
}
