import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Database, Download, HardDriveDownload } from 'lucide-react';
import type { AppSettings, AuditLog, BackupFile, Paginated, Sequence } from '@pos/shared';
import { api, errorMessage } from '../../lib/api';
import { dateTimeLabel, monthStart, today } from '../../lib/format';
import { Badge, Button, Card, Checkbox, DateRange, EmptyState, Field, Input, Pagination, SearchInput, Spinner, TableWrap } from '../../components/ui';
import { useSettingsForm } from './useSettingsForm';

const SEQUENCE_LABELS: Record<string, string> = {
  sale: 'Sales invoice',
  sale_return: 'Sale return',
  quotation: 'Quotation',
  purchase: 'Purchase',
  purchase_return: 'Purchase return',
  receipt: 'Payment receipt (money in)',
  voucher: 'Payment voucher (money out)',
  expense: 'Expense',
  adjustment: 'Stock adjustment',
  agreement: 'Credit agreement',
};

export function NumberingTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings', 'sequences'], queryFn: () => api.get<Sequence[]>('/settings/sequences') });
  const [drafts, setDrafts] = useState<Record<string, Sequence>>({});
  const save = useMutation({
    mutationFn: (s: Sequence) => api.put(`/settings/sequences/${s.name}`, { prefix: s.prefix, nextValue: s.nextValue, padding: s.padding }),
    onSuccess: () => {
      toast.success('Numbering updated');
      qc.invalidateQueries({ queryKey: ['settings', 'sequences'] });
      setDrafts({});
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (isLoading) return <Spinner />;
  return (
    <Card title="Document numbering" bodyClassName="p-0">
      <TableWrap>
        <table className="table-base">
          <thead>
            <tr>
              <th>Document</th>
              <th>Prefix</th>
              <th>Next number</th>
              <th>Digits</th>
              <th>Preview</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.map((row) => {
              const s = drafts[row.name] ?? row;
              const dirty = JSON.stringify(s) !== JSON.stringify(row);
              const update = (patch: Partial<Sequence>) => setDrafts((d) => ({ ...d, [row.name]: { ...s, ...patch } }));
              return (
                <tr key={row.name}>
                  <td className="font-medium">{SEQUENCE_LABELS[row.name] ?? row.name}</td>
                  <td className="w-32">
                    <Input value={s.prefix} onChange={(e) => update({ prefix: e.target.value.toUpperCase() })} />
                  </td>
                  <td className="w-32">
                    <Input type="number" min={row.nextValue} value={s.nextValue} onChange={(e) => update({ nextValue: Number(e.target.value) })} />
                  </td>
                  <td className="w-24">
                    <Input type="number" min={1} max={12} value={s.padding} onChange={(e) => update({ padding: Number(e.target.value) })} />
                  </td>
                  <td className="font-mono text-xs">{`${s.prefix}${String(s.nextValue).padStart(s.padding, '0')}`}</td>
                  <td>
                    <Button size="xs" variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(s)}>
                      Save
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <p className="px-4 py-3 text-xs text-slate-500">Numbers can only move forward, so invoice numbers are never repeated.</p>
    </Card>
  );
}

export function BackupTab({ settings }: { settings: AppSettings | undefined }) {
  const b = useSettingsForm(settings, 'backup');
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings', 'backups'], queryFn: () => api.get<{ directory: string; files: BackupFile[] }>('/admin/backups') });
  const create = useMutation({
    mutationFn: () => api.post<BackupFile>('/admin/backups'),
    onSuccess: (f) => {
      toast.success(`Backup created: ${f.name}`);
      qc.invalidateQueries({ queryKey: ['settings', 'backups'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        title="Backup settings"
        actions={
          b.draft && (
            <Button variant="primary" size="sm" disabled={!b.dirty} loading={b.save.isPending} onClick={() => b.save.mutate(b.draft!)}>
              Save
            </Button>
          )
        }
      >
        {b.draft && (
          <div className="space-y-3">
            <Checkbox checked={b.draft.autoEnabled} onChange={(v) => b.set('autoEnabled', v)} label="Automatic daily backup" description="A copy of the database is saved every day the system runs" />
            <Field label="Backups to keep">
              <Input type="number" min={1} max={365} value={b.draft.retentionCount} onChange={(e) => b.set('retentionCount', Number(e.target.value))} />
            </Field>
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              Backups are stored on the server computer at <span className="font-mono">{data?.directory}</span>. Copy them to a USB drive or cloud folder regularly.
            </p>
          </div>
        )}
      </Card>
      <Card
        title="Backup files"
        bodyClassName="p-0"
        actions={
          <Button size="sm" variant="primary" icon={<Database className="h-4 w-4" />} loading={create.isPending} onClick={() => create.mutate()}>
            Backup now
          </Button>
        }
      >
        {isLoading ? (
          <Spinner />
        ) : !data?.files.length ? (
          <EmptyState icon={<HardDriveDownload className="h-8 w-8" />} title="No backups yet" />
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Created</th>
                  <th className="num">Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.files.map((f) => (
                  <tr key={f.name}>
                    <td className="font-mono text-xs">{f.name}</td>
                    <td className="text-slate-600">{dateTimeLabel(f.createdAt)}</td>
                    <td className="num">{(f.size / 1024 / 1024).toFixed(2)} MB</td>
                    <td>
                      <a href={`/api/admin/backups/${f.name}`} download>
                        <Button size="xs" icon={<Download className="h-3.5 w-3.5" />}>
                          Download
                        </Button>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

export function AuditTab() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'audit', from, to, search, page],
    queryFn: () => api.get<Paginated<AuditLog>>('/admin/audit-logs', { from, to, search, page, pageSize: 100 }),
    placeholderData: (prev) => prev,
  });
  return (
    <Card
      bodyClassName="p-0"
      title={<DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />}
      actions={<SearchInput className="w-64" value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Action, user or details" />}
    >
      {isLoading ? (
        <Spinner />
      ) : !data?.data.length ? (
        <EmptyState title="No activity in this period" />
      ) : (
        <>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-slate-600">{dateTimeLabel(l.createdAt)}</td>
                    <td>{l.username ?? 'system'}</td>
                    <td>
                      <Badge color={l.action.includes('void') || l.action.includes('delete') ? 'red' : l.action.includes('login') ? 'gray' : 'blue'}>{l.action}</Badge>
                    </td>
                    <td className="text-xs text-slate-500">
                      {l.entityType}
                      {l.entityId ? ` #${l.entityId}` : ''}
                    </td>
                    <td className="max-w-md truncate font-mono text-xs text-slate-500">{l.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pagination page={page} pageSize={100} total={data.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}
