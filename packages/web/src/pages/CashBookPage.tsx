import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Lock, Wallet } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, type CashBookDay, type DayClosing, type Paginated } from '@pos/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { addDays, csvMoney, dateLabel, downloadCsv, money, timeLabel, today } from '../lib/format';
import { Badge, Button, Card, EmptyState, Field, Input, KeyValue, Modal, MoneyInput, PageHeader, Spinner, StatCard, Tabs, TableWrap, Textarea } from '../components/ui';

function CloseDayModal({ book, onClose }: { book: CashBookDay; onClose: () => void }) {
  const qc = useQueryClient();
  const [counted, setCounted] = useState<number | null>(book.expectedCash);
  const [notes, setNotes] = useState('');
  const save = useMutation({
    mutationFn: () => api.post('/cashbook/close', { date: book.date, countedCash: counted ?? 0, notes: notes || null }),
    onSuccess: () => {
      toast.success('Day closed');
      qc.invalidateQueries({ queryKey: ['cashbook'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const difference = (counted ?? 0) - book.expectedCash;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Close cash for ${dateLabel(book.date)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Close day
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md bg-slate-50 p-3">
          <KeyValue label="Opening cash" value={money(book.openingCash)} />
          <KeyValue label="Cash received" value={money(book.cashIn)} />
          <KeyValue label="Cash paid out" value={`-${money(book.cashOut)}`} />
          <KeyValue label="Expected cash in drawer" value={<span className="text-lg font-semibold">{money(book.expectedCash)}</span>} />
        </div>
        <Field label="Cash counted in drawer" required>
          <MoneyInput autoFocus value={counted} onChange={setCounted} />
        </Field>
        <p className={`text-sm font-medium ${difference === 0 ? 'text-emerald-700' : difference > 0 ? 'text-sky-700' : 'text-red-600'}`}>
          {difference === 0 ? 'Tallies exactly' : difference > 0 ? `Excess ${money(difference)}` : `Short ${money(-difference)}`}
        </p>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explain any difference" />
        </Field>
      </div>
    </Modal>
  );
}

function DayTab() {
  const { can } = useAuth();
  const [date, setDate] = useState(today());
  const [closeOpen, setCloseOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['cashbook', date], queryFn: () => api.get<CashBookDay>('/cashbook', { date }) });

  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setDate(addDays(date, -1))}>
          Previous day
        </Button>
        <Input type="date" className="w-44" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        <Button size="sm" disabled={date >= today()} onClick={() => setDate(addDays(date, 1))}>
          Next day
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDate(today())}>
          Today
        </Button>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            disabled={!data.entries.length}
            onClick={() =>
              downloadCsv(`cashbook-${date}.csv`, [
                ['Time', 'Type', 'Reference', 'Description', 'Cash in', 'Cash out', 'Balance'],
                ['', '', '', 'Opening balance', '', '', csvMoney(data.openingCash)],
                ...data.entries.map((e) => [timeLabel(e.time), e.type, e.referenceNo, e.description, csvMoney(e.cashIn), csvMoney(e.cashOut), csvMoney(e.balance)]),
              ])
            }
          >
            CSV
          </Button>
          {can('cashbook.close') && !data.closing && (
            <Button size="sm" variant="primary" icon={<Lock className="h-4 w-4" />} onClick={() => setCloseOpen(true)}>
              Close day
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Opening cash" value={money(data.openingCash)} />
        <StatCard label="Cash received" value={money(data.cashIn)} tone="good" />
        <StatCard label="Cash paid out" value={money(data.cashOut)} tone="bad" />
        <StatCard label="Expected in drawer" value={money(data.expectedCash)} hint={data.closing ? `Counted ${money(data.closing.countedCash)}` : 'Not closed yet'} />
      </div>

      {data.closing && (
        <div className={`rounded-md border px-4 py-3 text-sm ${data.closing.difference === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          Day closed by {data.closing.closedByName} - counted {money(data.closing.countedCash)} -{' '}
          {data.closing.difference === 0 ? 'tallied exactly' : data.closing.difference > 0 ? `excess ${money(data.closing.difference)}` : `short ${money(-data.closing.difference)}`}
          {data.closing.notes ? ` - ${data.closing.notes}` : ''}
        </div>
      )}
      {closeOpen && <CloseDayModal book={data} onClose={() => setCloseOpen(false)} />}

      <Card title="Cash transactions (roznamcha)" bodyClassName="p-0">
        {!data.entries.length ? (
          <EmptyState icon={<Wallet className="h-8 w-8" />} title="No cash movement on this day" />
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th className="num">Cash in</th>
                  <th className="num">Cash out</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-50">
                  <td colSpan={6} className="font-medium text-slate-600">
                    Opening cash
                  </td>
                  <td className="num font-semibold">{money(data.openingCash)}</td>
                </tr>
                {data.entries.map((e, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap text-slate-600">{timeLabel(e.time)}</td>
                    <td>{e.type}</td>
                    <td className="font-mono text-xs">{e.referenceNo}</td>
                    <td className="text-sm">{e.description}</td>
                    <td className="num text-emerald-700">{e.cashIn ? money(e.cashIn) : ''}</td>
                    <td className="num text-red-600">{e.cashOut ? money(e.cashOut) : ''}</td>
                    <td className="num font-medium">{money(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card title="All payment methods on this day" bodyClassName="p-0">
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>Method</th>
                <th className="num">Received</th>
                <th className="num">Paid out</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.methodTotals.map((m) => (
                <tr key={m.method}>
                  <td>{PAYMENT_METHOD_LABELS[m.method]}</td>
                  <td className="num">{money(m.received)}</td>
                  <td className="num">{money(m.paid)}</td>
                  <td className="num font-medium">{money(m.received - m.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}

function ClosingsTab() {
  const { data, isLoading } = useQuery({ queryKey: ['cashbook', 'closings'], queryFn: () => api.get<Paginated<DayClosing>>('/cashbook/closings', { pageSize: 100 }) });
  if (isLoading) return <Spinner />;
  if (!data?.data.length) return <EmptyState title="No days closed yet" description="Close the day to record the counted cash and any difference." />;
  return (
    <Card bodyClassName="p-0">
      <TableWrap>
        <table className="table-base">
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Opening</th>
              <th className="num">Cash in</th>
              <th className="num">Cash out</th>
              <th className="num">Expected</th>
              <th className="num">Counted</th>
              <th className="num">Difference</th>
              <th>Closed by</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{dateLabel(c.closingDate)}</td>
                <td className="num">{money(c.openingCash)}</td>
                <td className="num text-emerald-700">{money(c.cashIn)}</td>
                <td className="num text-red-600">{money(c.cashOut)}</td>
                <td className="num">{money(c.expectedCash)}</td>
                <td className="num font-medium">{money(c.countedCash)}</td>
                <td className="num">
                  {c.difference === 0 ? <Badge color="green">Tallied</Badge> : <Badge color={c.difference > 0 ? 'blue' : 'red'}>{money(c.difference)}</Badge>}
                </td>
                <td className="text-slate-600">{c.closedByName}</td>
                <td className="max-w-xs truncate text-slate-500">{c.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

export function CashBookPage() {
  const [tab, setTab] = useState<'day' | 'closings'>('day');
  return (
    <div>
      <PageHeader title="Cash Book" subtitle="Daily cash in/out (roznamcha), drawer tally and day closing history" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'day', label: 'Daily cash book' },
          { value: 'closings', label: 'Day closings' },
        ]}
      />
      {tab === 'day' ? <DayTab /> : <ClosingsTab />}
    </div>
  );
}
