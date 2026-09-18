import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquareText, Send } from 'lucide-react';
import type { AppSettings } from '@pos/shared';
import { api, errorMessage } from '../../lib/api';
import { Button, Card, Checkbox, Field, Input, Select, Textarea } from '../../components/ui';
import { useSettingsForm } from './useSettingsForm';

export function NotificationsTab({ settings }: { settings: AppSettings | undefined }) {
  const n = useSettingsForm(settings, 'notifications');
  const [testPhone, setTestPhone] = useState('');
  const test = useMutation({
    mutationFn: () => api.post('/notifications/test-sms', { phone: testPhone }),
    onSuccess: () => toast.success('Test SMS sent'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!n.draft) return null;
  const d = n.draft;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        title="WhatsApp & SMS receipts"
        actions={
          <Button variant="primary" size="sm" disabled={!n.dirty} loading={n.save.isPending} onClick={() => n.save.mutate(d)}>
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Checkbox checked={d.whatsappEnabled} onChange={(v) => n.set('whatsappEnabled', v)} label="Enable WhatsApp sharing" description="Opens WhatsApp with the receipt text ready to send - no gateway or cost" />
          <Checkbox checked={d.smsEnabled} onChange={(v) => n.set('smsEnabled', v)} label="Enable SMS sending" description="Requires an SMS gateway account" />
          <Checkbox checked={d.autoSmsOnSale} onChange={(v) => n.set('autoSmsOnSale', v)} label="Send SMS automatically after every sale" />
          <Checkbox checked={d.autoSmsOnPayment} onChange={(v) => n.set('autoSmsOnPayment', v)} label="Send SMS automatically when a payment is received" />
          <Field label="Phone number format sent to the gateway">
            <Select value={d.smsPhoneFormat} onChange={(e) => n.set('smsPhoneFormat', e.target.value as 'local' | 'international')}>
              <option value="international">923001234567 (international)</option>
              <option value="local">03001234567 (local)</option>
            </Select>
          </Field>
          <Field label="Request method">
            <Select value={d.smsMethod} onChange={(e) => n.set('smsMethod', e.target.value as 'GET' | 'POST')}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </Select>
          </Field>
          <Field label="Gateway URL" hint="Use {phone} and {message} placeholders">
            <Textarea rows={2} className="font-mono text-xs" value={d.smsUrl} onChange={(e) => n.set('smsUrl', e.target.value)} placeholder="https://api.example.com/send?key=YOUR_KEY&to={phone}&text={message}" />
          </Field>
          {d.smsMethod === 'POST' && (
            <Field label="Request body" hint="JSON or form-encoded, with {phone} and {message}">
              <Textarea rows={2} className="font-mono text-xs" value={d.smsBody} onChange={(e) => n.set('smsBody', e.target.value)} />
            </Field>
          )}
          <Field label="Extra headers (JSON)" hint="For example an Authorization header for your gateway">
            <Textarea rows={2} className="font-mono text-xs" value={d.smsHeaders} onChange={(e) => n.set('smsHeaders', e.target.value)} />
          </Field>
          <div className="flex items-end gap-2 rounded-md bg-slate-50 p-3">
            <Field label="Send a test SMS to" className="flex-1">
              <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="0300-1234567" />
            </Field>
            <Button icon={<Send className="h-4 w-4" />} disabled={!testPhone} loading={test.isPending} onClick={() => test.mutate()}>
              Test
            </Button>
          </div>
        </div>
      </Card>
      <Card
        title="Message templates"
        actions={
          <Button variant="primary" size="sm" disabled={!n.dirty} loading={n.save.isPending} onClick={() => n.save.mutate(d)}>
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Sale receipt" hint="Placeholders: customerName, invoiceNo, date, items, total, paid, balanceDue, currentBalance, shopName, shopPhone">
            <Textarea rows={8} className="font-mono text-xs" value={d.saleTemplate} onChange={(e) => n.set('saleTemplate', e.target.value)} />
          </Field>
          <Field label="Payment received" hint="Placeholders: customerName, amount, method, date, paymentNo, currentBalance">
            <Textarea rows={3} className="font-mono text-xs" value={d.paymentTemplate} onChange={(e) => n.set('paymentTemplate', e.target.value)} />
          </Field>
          <Field label="Payment reminder" hint="Placeholders: customerName, currentBalance, dueDateLine, shopName, shopPhone">
            <Textarea rows={3} className="font-mono text-xs" value={d.reminderTemplate} onChange={(e) => n.set('reminderTemplate', e.target.value)} />
          </Field>
          <p className="flex items-start gap-2 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" />
            The item list is only included in WhatsApp messages; SMS messages leave it out to stay short.
          </p>
        </div>
      </Card>
    </div>
  );
}

export function FbrTab({ settings }: { settings: AppSettings | undefined }) {
  const fbr = useSettingsForm(settings, 'fbr');
  const sync = useMutation({
    mutationFn: () => api.post<{ processed: number }>('/sales/fbr/sync-pending'),
    onSuccess: (r) => toast.success(`${r.processed} invoice(s) processed`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!fbr.draft) return null;
  const d = fbr.draft;
  return (
    <Card
      title="FBR POS integration (Tier-1 retailers)"
      actions={
        <>
          <Button size="sm" loading={sync.isPending} onClick={() => sync.mutate()}>
            Sync pending invoices
          </Button>
          <Button variant="primary" size="sm" disabled={!fbr.dirty} loading={fbr.save.isPending} onClick={() => fbr.save.mutate(d)}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Checkbox
            checked={d.enabled}
            onChange={(v) => fbr.set('enabled', v)}
            label="Send invoices to FBR"
            description="Only required for Tier-1 retailers registered with the FBR POS system. Invoices are queued and retried automatically if the internet is down."
          />
        </div>
        <Field label="Environment">
          <Select value={d.environment} onChange={(e) => fbr.set('environment', e.target.value as 'sandbox' | 'production')}>
            <option value="sandbox">Sandbox (testing)</option>
            <option value="production">Production (live)</option>
          </Select>
        </Field>
        <Field label="POS ID" hint="Issued by FBR after POS registration">
          <Input value={d.posId} onChange={(e) => fbr.set('posId', e.target.value)} />
        </Field>
        <Field label="Access token" hint="Bearer token from the FBR IRIS portal">
          <Input type="password" value={d.token} onChange={(e) => fbr.set('token', e.target.value)} />
        </Field>
        <Field label="Timeout (seconds)">
          <Input type="number" min={2} max={60} value={d.timeoutSeconds} onChange={(e) => fbr.set('timeoutSeconds', Number(e.target.value))} />
        </Field>
        <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 sm:col-span-2">
          Before going live, test with FBR sandbox credentials and confirm the fiscal invoice number appears on printed receipts. Each product needs its PCT/HS code filled in.
        </p>
      </div>
    </Card>
  );
}

export function AgreementSettingsTab({ settings }: { settings: AppSettings | undefined }) {
  const a = useSettingsForm(settings, 'agreement');
  const z = useSettingsForm(settings, 'zakat');
  if (!a.draft || !z.draft) return null;
  const d = a.draft;
  return (
    <div className="space-y-4">
      <Card
        title="Credit agreement (stamp paper)"
        actions={
          <Button variant="primary" size="sm" disabled={!a.dirty} loading={a.save.isPending} onClick={() => a.save.mutate(d)}>
            Save
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Paper size">
            <Select value={d.paperSize} onChange={(e) => a.set('paperSize', e.target.value as 'legal' | 'a4')}>
              <option value="legal">Legal (8.5 x 14 in) - Pakistani stamp paper</option>
              <option value="a4">A4</option>
            </Select>
          </Field>
          <Field label="Blank space at top (inches)" hint="Leaves room for the printed stamp paper header">
            <Input type="number" step="0.25" min={0} max={10} value={d.topMarginInches} onChange={(e) => a.set('topMarginInches', Number(e.target.value))} />
          </Field>
          <Field label="Language">
            <Select value={d.language} onChange={(e) => a.set('language', e.target.value as 'english' | 'urdu' | 'bilingual')}>
              <option value="english">English</option>
              <option value="urdu">Urdu</option>
              <option value="bilingual">Both (Urdu and English)</option>
            </Select>
          </Field>
          <Field label="Default repayment period (days)">
            <Input type="number" min={1} max={3650} value={d.defaultDays} onChange={(e) => a.set('defaultDays', Number(e.target.value))} />
          </Field>
          <Field label="English wording" className="sm:col-span-3" hint="Placeholders: customerName, fatherName, cnic, phone, address, amount, amountWords, dueDate, days, terms, shopName, shopAddress, shopCity, installmentClause">
            <Textarea rows={10} className="font-mono text-xs" value={d.englishTemplate} onChange={(e) => a.set('englishTemplate', e.target.value)} />
          </Field>
          <Field label="Urdu wording" className="sm:col-span-3">
            <Textarea rows={10} className="urdu text-right" dir="rtl" value={d.urduTemplate} onChange={(e) => a.set('urduTemplate', e.target.value)} />
          </Field>
        </div>
        <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          This wording is a starting point, not legal advice. Have your lawyer review it once and then keep it saved here.
        </p>
      </Card>
      <Card
        title="Zakat defaults"
        actions={
          <Button variant="primary" size="sm" disabled={!z.dirty} loading={z.save.isPending} onClick={() => z.save.mutate(z.draft!)}>
            Save
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Zakat rate (%)">
            <Input type="number" step="0.01" value={z.draft.rate} onChange={(e) => z.set('rate', Number(e.target.value))} />
          </Field>
          <Field label="Nisab value (paisa)" hint="Value of 52.5 tola silver or 7.5 tola gold, in rupees x 100">
            <Input type="number" value={z.draft.nisabValue} onChange={(e) => z.set('nisabValue', Number(e.target.value))} />
          </Field>
          <Field label="Default stock valuation">
            <Select value={z.draft.valuationBasis} onChange={(e) => z.set('valuationBasis', e.target.value as 'retail' | 'wholesale' | 'cost')}>
              <option value="wholesale">Wholesale / market value</option>
              <option value="retail">Retail price</option>
              <option value="cost">Cost price</option>
            </Select>
          </Field>
        </div>
      </Card>
    </div>
  );
}
