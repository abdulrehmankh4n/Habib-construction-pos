import type { AppSettings, LedgerStatement } from '@pos/shared';
import { dateLabel, dateTimeLabel, money } from '../../lib/format';
import { ShopHeader } from './PrintShell';

export function StatementPrint({ statement, settings, party }: { statement: LedgerStatement; settings: AppSettings; party: 'customer' | 'supplier' }) {
  return (
    <div className="a4-doc text-[10pt]">
      <ShopHeader settings={settings} title={party === 'customer' ? 'Customer Statement' : 'Supplier Statement'} />
      <div className="mt-4 flex justify-between gap-6">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{party === 'customer' ? 'Customer' : 'Supplier'}</p>
          <p className="text-[11pt] font-semibold">{statement.party.name}</p>
          {statement.party.address && <p className="max-w-xs text-slate-600">{statement.party.address}</p>}
          {statement.party.phone && <p className="text-slate-600">{statement.party.phone}</p>}
        </div>
        <table className="h-fit text-[10pt]">
          <tbody>
            <tr>
              <td className="pr-3 text-slate-500">Period</td>
              <td>{statement.from ? `${dateLabel(statement.from)} to ${dateLabel(statement.to)}` : 'All transactions'}</td>
            </tr>
            <tr>
              <td className="pr-3 text-slate-500">Printed</td>
              <td>{dateTimeLabel(new Date().toISOString().slice(0, 19).replace('T', ' '))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <table className="mt-4 w-full border-collapse text-[9.5pt]">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1 text-left">Date</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Reference</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Description</th>
            <th className="border border-slate-300 px-2 py-1 text-right">Debit</th>
            <th className="border border-slate-300 px-2 py-1 text-right">Credit</th>
            <th className="border border-slate-300 px-2 py-1 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-slate-300 px-2 py-1" colSpan={5}>
              Opening balance
            </td>
            <td className="border border-slate-300 px-2 py-1 text-right font-medium">{money(statement.openingBalance)}</td>
          </tr>
          {statement.entries.map((e) => (
            <tr key={e.id}>
              <td className="border border-slate-300 px-2 py-1 whitespace-nowrap">{dateLabel(e.entryDate)}</td>
              <td className="border border-slate-300 px-2 py-1">{e.referenceNo ?? ''}</td>
              <td className="border border-slate-300 px-2 py-1">{e.description}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{e.debit ? money(e.debit) : ''}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{e.credit ? money(e.credit) : ''}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{money(e.balance)}</td>
            </tr>
          ))}
          <tr className="bg-slate-100 font-bold">
            <td className="border border-slate-300 px-2 py-1" colSpan={3}>
              Closing balance
            </td>
            <td className="border border-slate-300 px-2 py-1 text-right">{money(statement.totalDebit)}</td>
            <td className="border border-slate-300 px-2 py-1 text-right">{money(statement.totalCredit)}</td>
            <td className="border border-slate-300 px-2 py-1 text-right">{money(statement.closingBalance)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-4 text-[9pt] text-slate-600">
        {statement.closingBalance > 0
          ? party === 'customer'
            ? `Amount receivable from ${statement.party.name}: ${money(statement.closingBalance)}`
            : `Amount payable to ${statement.party.name}: ${money(statement.closingBalance)}`
          : statement.closingBalance < 0
            ? `Advance balance: ${money(-statement.closingBalance)}`
            : 'Account settled.'}
      </p>
      <div className="mt-10 flex justify-between gap-6 text-center text-[9pt]">
        <div>
          <div className="mb-1 h-10 w-44 border-b border-slate-400" />
          Received / verified by
        </div>
        <div>
          <div className="mb-1 h-10 w-44 border-b border-slate-400" />
          For {settings.shop.name}
        </div>
      </div>
    </div>
  );
}
