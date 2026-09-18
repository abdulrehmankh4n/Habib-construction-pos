import type { AppSettings, Sale } from '@pos/shared';
import { dateTimeLabel, qty } from '../../lib/format';
import { ShopHeader } from './PrintShell';

export function DeliveryChallan({ sale, settings }: { sale: Sale; settings: AppSettings }) {
  return (
    <div className="a4-doc text-[10pt]">
      <ShopHeader settings={settings} title="Delivery Challan" />
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Deliver to</p>
          <p className="text-[11pt] font-semibold">{sale.customerName ?? settings.sales.walkInLabel}</p>
          <p className="text-slate-600">{sale.deliveryAddress ?? sale.customerAddress}</p>
          <p className="text-slate-600">{sale.customerPhone}</p>
        </div>
        <table className="h-fit justify-self-end text-[10pt]">
          <tbody>
            <tr>
              <td className="pr-3 text-slate-500">Challan for invoice</td>
              <td className="font-semibold">{sale.invoiceNo}</td>
            </tr>
            <tr>
              <td className="pr-3 text-slate-500">Date</td>
              <td>{dateTimeLabel(sale.saleDate)}</td>
            </tr>
            <tr>
              <td className="pr-3 text-slate-500">Vehicle no.</td>
              <td className="font-semibold">{sale.vehicleNo ?? '________'}</td>
            </tr>
            <tr>
              <td className="pr-3 text-slate-500">Driver</td>
              <td>{[sale.driverName, sale.driverPhone].filter(Boolean).join(' - ') || '________'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <table className="mt-5 w-full border-collapse text-[10pt]">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1 text-left">#</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Description</th>
            <th className="border border-slate-300 px-2 py-1 text-right">Quantity</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Unit</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((i, idx) => (
            <tr key={i.id}>
              <td className="border border-slate-300 px-2 py-1.5">{idx + 1}</td>
              <td className="border border-slate-300 px-2 py-1.5">
                {i.productName}
                {settings.receipt.showUrduNames && i.urduName && <span className="urdu block text-[10pt] leading-tight">{i.urduName}</span>}
              </td>
              <td className="border border-slate-300 px-2 py-1.5 text-right font-medium">{qty(i.qty)}</td>
              <td className="border border-slate-300 px-2 py-1.5">{i.unitName}</td>
              <td className="border border-slate-300 px-2 py-1.5" />
            </tr>
          ))}
        </tbody>
      </table>
      {sale.notes && <p className="mt-3 text-[9pt] text-slate-600">Note: {sale.notes}</p>}
      <p className="mt-4 text-[8.5pt] text-slate-600">
        Please check the material and quantity at the time of delivery. Goods are transported at the buyer&apos;s risk once loaded.
      </p>
      <div className="mt-10 flex justify-between gap-6 text-center text-[9pt]">
        <div>
          <div className="mb-1 h-10 w-40 border-b border-slate-400" />
          Received by (name &amp; signature)
        </div>
        <div>
          <div className="mb-1 h-10 w-40 border-b border-slate-400" />
          Driver
        </div>
        <div>
          <div className="mb-1 h-10 w-40 border-b border-slate-400" />
          For {settings.shop.name}
        </div>
      </div>
    </div>
  );
}
