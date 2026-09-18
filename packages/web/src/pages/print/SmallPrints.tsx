import { PAYMENT_METHOD_LABELS, REFUND_METHOD_LABELS, amountInWords, type AppSettings, type Payment, type SaleReturn, type ZakatReport } from '@pos/shared';
import { dateTimeLabel, money, percent, qty } from '../../lib/format';
import { ShopHeader } from './PrintShell';

export function ReturnSlip({ ret, settings }: { ret: SaleReturn; settings: AppSettings }) {
  return (
    <div className="slip font-mono">
      <ShopHeader settings={settings} title="Sale Return / Credit Note" compact />
      <div className="mt-1 text-[8pt]">
        <div className="flex justify-between">
          <span>Return: {ret.returnNo}</span>
          <span>{dateTimeLabel(ret.returnDate)}</span>
        </div>
        <div className="flex justify-between">
          <span>Against invoice: {ret.invoiceNo}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer: {ret.customerName ?? settings.sales.walkInLabel}</span>
        </div>
      </div>
      <table className="mt-1 w-full border-y border-dashed border-black text-[8.5pt]">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="py-0.5 text-left">Item</th>
            <th className="py-0.5 text-right">Qty</th>
            <th className="py-0.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {ret.items?.map((i) => (
            <tr key={i.id}>
              <td className="py-0.5">
                {i.productName}
                {!i.restock && <span className="text-[7pt]"> (damaged)</span>}
              </td>
              <td className="py-0.5 text-right">
                {qty(i.qty)} {i.unitName}
              </td>
              <td className="py-0.5 text-right">{money(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-[9pt]">
        <div className="flex justify-between border-y border-black py-0.5 text-[11pt] font-bold">
          <span>RETURN TOTAL</span>
          <span>{money(ret.totalAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span>Settlement</span>
          <span>{REFUND_METHOD_LABELS[ret.refundMethod]}</span>
        </div>
        {ret.refundAmount > 0 && (
          <div className="flex justify-between font-bold">
            <span>Refund paid</span>
            <span>{money(ret.refundAmount)}</span>
          </div>
        )}
        {ret.reason && <p className="mt-1 text-[8pt]">Reason: {ret.reason}</p>}
      </div>
      <div className="mt-3 flex justify-between text-[8pt]">
        <span>Customer sign ____________</span>
        <span>{ret.createdByName}</span>
      </div>
    </div>
  );
}

export function PaymentReceiptSlip({ payment, settings, balance }: { payment: Payment; settings: AppSettings; balance?: number | null }) {
  const isIn = payment.direction === 'in';
  return (
    <div className="slip font-mono">
      <ShopHeader settings={settings} title={isIn ? 'Payment Receipt' : 'Payment Voucher'} compact />
      <div className="mt-2 text-[9pt]">
        <div className="flex justify-between">
          <span>No.</span>
          <span className="font-bold">{payment.paymentNo}</span>
        </div>
        <div className="flex justify-between">
          <span>Date</span>
          <span>{dateTimeLabel(payment.paymentDate)}</span>
        </div>
        <div className="flex justify-between">
          <span>{isIn ? 'Received from' : 'Paid to'}</span>
          <span>{payment.partyName ?? '-'}</span>
        </div>
        <div className="flex justify-between">
          <span>Method</span>
          <span>{PAYMENT_METHOD_LABELS[payment.method]}</span>
        </div>
        {payment.reference && (
          <div className="flex justify-between">
            <span>Reference</span>
            <span>{payment.reference}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-y border-black py-1 text-[13pt] font-bold">
          <span>AMOUNT</span>
          <span>{money(payment.amount)}</span>
        </div>
        <p className="mt-1 text-[8pt]">{amountInWords(payment.amount)}</p>
        {balance !== undefined && balance !== null && (
          <div className="mt-1 flex justify-between text-[9pt] font-bold">
            <span>Balance after</span>
            <span>{money(balance)}</span>
          </div>
        )}
        {payment.notes && <p className="mt-1 text-[8pt]">{payment.notes}</p>}
      </div>
      <div className="mt-6 flex justify-between text-[8pt]">
        <span>Signature ____________</span>
        <span>{payment.createdByName}</span>
      </div>
      <p className="mt-2 text-center text-[8pt]">{settings.receipt.footer}</p>
    </div>
  );
}

export function ZakatPrint({ report, settings }: { report: ZakatReport; settings: AppSettings }) {
  const snap = report.snapshot;
  return (
    <div className="a4-doc text-[10pt]">
      <ShopHeader settings={settings} title="Zakat Calculation" />
      <p className="mt-3 text-[10pt] text-slate-600">
        Calculated on {dateTimeLabel(report.reportDate)} by {report.createdByName} · stock valued at {report.valuationBasis} price
      </p>
      <table className="mt-4 w-full border-collapse text-[10pt]">
        <tbody>
          <tr>
            <td className="border border-slate-300 px-3 py-1.5">Stock in trade</td>
            <td className="border border-slate-300 px-3 py-1.5 text-right">{money(report.stockValue)}</td>
          </tr>
          <tr>
            <td className="border border-slate-300 px-3 py-1.5">Cash in hand and bank</td>
            <td className="border border-slate-300 px-3 py-1.5 text-right">{money(report.cashValue)}</td>
          </tr>
          <tr>
            <td className="border border-slate-300 px-3 py-1.5">Receivables (money owed by customers)</td>
            <td className="border border-slate-300 px-3 py-1.5 text-right">{money(report.receivablesValue)}</td>
          </tr>
          <tr>
            <td className="border border-slate-300 px-3 py-1.5">Other zakatable assets</td>
            <td className="border border-slate-300 px-3 py-1.5 text-right">{money(report.otherAssets)}</td>
          </tr>
          <tr>
            <td className="border border-slate-300 px-3 py-1.5">Less: liabilities</td>
            <td className="border border-slate-300 px-3 py-1.5 text-right">-{money(report.liabilities)}</td>
          </tr>
          <tr className="bg-slate-100 font-semibold">
            <td className="border border-slate-300 px-3 py-1.5">Net zakatable wealth</td>
            <td className="border border-slate-300 px-3 py-1.5 text-right">{money(report.netZakatable)}</td>
          </tr>
          <tr>
            <td className="border border-slate-300 px-3 py-1.5">Nisab threshold</td>
            <td className="border border-slate-300 px-3 py-1.5 text-right">{report.nisabValue ? money(report.nisabValue) : 'Not set'}</td>
          </tr>
          <tr className="bg-slate-800 text-white">
            <td className="border border-slate-800 px-3 py-2 text-[12pt] font-bold">Zakat payable at {percent(report.rate)}</td>
            <td className="border border-slate-800 px-3 py-2 text-right text-[12pt] font-bold">{money(report.zakatPayable)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[9pt] text-slate-600">{amountInWords(report.zakatPayable)}</p>
      {report.notes && <p className="mt-2 text-[9pt] text-slate-600">Notes: {report.notes}</p>}
      {snap && (
        <>
          <h3 className="mt-5 text-[11pt] font-semibold">Stock detail at the time of calculation</h3>
          <table className="mt-2 w-full border-collapse text-[8.5pt]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-1 text-left">Product</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Category</th>
                <th className="border border-slate-300 px-2 py-1 text-right">Quantity</th>
                <th className="border border-slate-300 px-2 py-1 text-right">Rate</th>
                <th className="border border-slate-300 px-2 py-1 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {snap.lines.map((l) => (
                <tr key={l.productId}>
                  <td className="border border-slate-300 px-2 py-1">{l.productName}</td>
                  <td className="border border-slate-300 px-2 py-1">{l.categoryName}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{qty(l.qty, l.unitSymbol)}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{money(l.rate)}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right">{money(l.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="mt-4 text-[8pt] text-slate-500">
        Prepared from {settings.shop.name} records. Zakat rulings differ by school of thought; please confirm the treatment of specific assets with a qualified scholar.
      </p>
    </div>
  );
}
