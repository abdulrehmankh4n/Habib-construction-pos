import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import type { LedgerStatement } from '@pos/shared';
import { api } from '../lib/api';
import { csvMoney, dateTimeLabel, downloadCsv, money, titleCase } from '../lib/format';
import { printUrl } from '../lib/print';
import { Button, Card, DateRange, EmptyState, Spinner, TableWrap } from './ui';

function refLink(e: LedgerStatement['entries'][number]) {
  if (e.referenceType === 'sale' && e.referenceId) return `/sales/${e.referenceId}`;
  if (e.referenceType === 'purchase' && e.referenceId) return `/purchases/${e.referenceId}`;
  return null;
}

export function LedgerView({ party, id }: { party: 'customer' | 'supplier'; id: number }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: [party === 'customer' ? 'customers' : 'suppliers', id, 'statement', from, to],
    queryFn: () => api.get<LedgerStatement>(`/${party === 'customer' ? 'customers' : 'suppliers'}/${id}/statement`, { from, to }),
  });
  const debitLabel = party === 'customer' ? 'Debit (bill)' : 'Debit (paid)';
  const creditLabel = party === 'customer' ? 'Credit (paid)' : 'Credit (bill)';

  return (
    <Card
      bodyClassName="p-0"
      title={
        <div className="flex flex-wrap items-center gap-2">
          <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          {(from || to) && (
            <Button size="xs" variant="ghost" onClick={() => { setFrom(''); setTo(''); }}>
              All time
            </Button>
          )}
        </div>
      }
      actions={
        <>
          <Button
            size="sm"
            icon={<Download className="h-4 w-4" />}
            disabled={!data?.entries.length}
            onClick={() =>
              data &&
              downloadCsv(`${party}-${id}-statement.csv`, [
                ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
                ['', '', 'Opening balance', '', '', csvMoney(data.openingBalance)],
                ...data.entries.map((e) => [e.entryDate, e.referenceNo, e.description, csvMoney(e.debit), csvMoney(e.credit), csvMoney(e.balance)]),
              ])
            }
          >
            CSV
          </Button>
          <Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => printUrl(`/print/statement/${party}/${id}?from=${from}&to=${to}`)}>
            Print statement
          </Button>
        </>
      }
    >
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Description</th>
                <th className="num">{debitLabel}</th>
                <th className="num">{creditLabel}</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-slate-50">
                <td colSpan={5} className="text-sm font-medium text-slate-600">
                  Opening balance {data.from ? `(before ${data.from})` : ''}
                </td>
                <td className="num font-semibold">{money(data.openingBalance)}</td>
              </tr>
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title="No transactions in this period" />
                  </td>
                </tr>
              )}
              {data.entries.map((e) => {
                const link = refLink(e);
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-slate-600">{dateTimeLabel(e.entryDate)}</td>
                    <td className="whitespace-nowrap text-xs">
                      {link ? (
                        <Link to={link} className="text-brand-700 hover:underline">
                          {e.referenceNo}
                        </Link>
                      ) : (
                        e.referenceNo ?? titleCase(e.entryType)
                      )}
                    </td>
                    <td className="text-sm">{e.description}</td>
                    <td className="num">{e.debit ? money(e.debit) : ''}</td>
                    <td className="num">{e.credit ? money(e.credit) : ''}</td>
                    <td className="num font-medium">{money(e.balance)}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={3}>Closing balance</td>
                <td className="num">{money(data.totalDebit)}</td>
                <td className="num">{money(data.totalCredit)}</td>
                <td className="num">{money(data.closingBalance)}</td>
              </tr>
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}
