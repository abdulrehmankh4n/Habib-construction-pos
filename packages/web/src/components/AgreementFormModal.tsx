import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreditAgreement, Customer } from '@pos/shared';
import { api, errorMessage } from '../lib/api';
import { useSettings } from '../lib/auth';
import { addDays, money, today } from '../lib/format';
import { printUrl } from '../lib/print';
import { Button, Field, Input, Modal, MoneyInput, QtyInput, Textarea } from './ui';
import { CustomerPicker } from './pickers';

interface FormState {
  customer: Customer | null;
  fatherName: string;
  cnic: string;
  phone: string;
  address: string;
  amount: number | null;
  agreementDate: string;
  days: number | null;
  dueDate: string;
  installments: number | null;
  terms: string;
  witness1Name: string;
  witness1Cnic: string;
  witness2Name: string;
  witness2Cnic: string;
  notes: string;
}

function defaultTerms(installments: number, amount: number | null): string {
  if (installments <= 1 || !amount) return 'No further goods will be supplied on credit until the outstanding amount is cleared, unless agreed by the Seller in writing.';
  return `The amount shall be paid in ${installments} equal instalments of about ${money(Math.ceil(amount / installments / 100) * 100)} each. No further goods will be supplied on credit until the outstanding amount is cleared, unless agreed by the Seller in writing.`;
}

export function AgreementFormModal({
  open,
  onClose,
  customer,
  agreement,
}: {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  agreement?: CreditAgreement | null;
}) {
  const qc = useQueryClient();
  const settings = useSettings();
  const defaultDays = settings.data?.agreement.defaultDays ?? 90;
  const [form, setForm] = useState<FormState | null>(null);
  const [termsTouched, setTermsTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTermsTouched(!!agreement);
    if (agreement) {
      const start = agreement.agreementDate.slice(0, 10);
      setForm({
        customer: customer ?? null,
        fatherName: agreement.fatherName ?? '',
        cnic: agreement.cnic ?? '',
        phone: agreement.phone ?? '',
        address: agreement.address ?? '',
        amount: agreement.amount,
        agreementDate: start,
        days: Math.round((Date.parse(agreement.dueDate) - Date.parse(start)) / 86_400_000),
        dueDate: agreement.dueDate,
        installments: agreement.installments,
        terms: agreement.terms ?? '',
        witness1Name: agreement.witness1Name ?? '',
        witness1Cnic: agreement.witness1Cnic ?? '',
        witness2Name: agreement.witness2Name ?? '',
        witness2Cnic: agreement.witness2Cnic ?? '',
        notes: agreement.notes ?? '',
      });
    } else {
      const start = today();
      setForm({
        customer: customer ?? null,
        fatherName: customer?.fatherName ?? '',
        cnic: customer?.cnic ?? '',
        phone: customer?.phone ?? '',
        address: [customer?.address, customer?.city].filter(Boolean).join(', '),
        amount: customer && customer.balance > 0 ? customer.balance : null,
        agreementDate: start,
        days: defaultDays,
        dueDate: addDays(start, defaultDays),
        installments: 1,
        terms: defaultTerms(1, customer?.balance ?? null),
        witness1Name: '',
        witness1Cnic: '',
        witness2Name: '',
        witness2Cnic: '',
        notes: '',
      });
    }
  }, [open, agreement, customer, defaultDays]);

  const save = useMutation({
    mutationFn: () => {
      if (!form?.customer && !agreement) throw new Error('Select the customer');
      const body = {
        customerId: agreement?.customerId ?? form!.customer!.id,
        fatherName: form!.fatherName,
        cnic: form!.cnic,
        phone: form!.phone || null,
        address: form!.address,
        amount: form!.amount,
        agreementDate: form!.agreementDate,
        dueDate: form!.dueDate,
        installments: form!.installments ?? 1,
        terms: form!.terms || null,
        witness1Name: form!.witness1Name || null,
        witness1Cnic: form!.witness1Cnic || null,
        witness2Name: form!.witness2Name || null,
        witness2Cnic: form!.witness2Cnic || null,
        notes: form!.notes || null,
      };
      return agreement ? api.put<CreditAgreement>(`/agreements/${agreement.id}`, body) : api.post<CreditAgreement>('/agreements', body);
    },
    onSuccess: (a) => {
      toast.success(`Agreement ${a.agreementNo} saved`);
      qc.invalidateQueries({ queryKey: ['agreements'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      printUrl(`/print/agreement/${a.id}`);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!form) return null;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const updateSchedule = (patch: Partial<FormState>) =>
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, ...patch };
      if (patch.days !== undefined || patch.agreementDate !== undefined) next.dueDate = addDays(next.agreementDate, next.days ?? 0);
      if (!termsTouched && (patch.installments !== undefined || patch.amount !== undefined)) next.terms = defaultTerms(next.installments ?? 1, next.amount);
      return next;
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={agreement ? `Edit agreement ${agreement.agreementNo}` : 'New credit agreement (stamp paper)'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save & print
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {!agreement && (
          <Field label="Customer" required className="md:col-span-2">
            <CustomerPicker
              value={form.customer}
              onChange={(c) =>
                setForm((f) =>
                  f
                    ? {
                        ...f,
                        customer: c,
                        fatherName: c?.fatherName ?? f.fatherName,
                        cnic: c?.cnic ?? f.cnic,
                        phone: c?.phone ?? f.phone,
                        address: c ? [c.address, c.city].filter(Boolean).join(', ') : f.address,
                        amount: c && c.balance > 0 ? c.balance : f.amount,
                      }
                    : f,
                )
              }
            />
          </Field>
        )}
        <Field label="Father / Husband name" required hint="Printed as S/O, D/O or W/O">
          <Input value={form.fatherName} onChange={(e) => set('fatherName', e.target.value)} />
        </Field>
        <Field label="CNIC" required>
          <Input value={form.cnic} onChange={(e) => set('cnic', e.target.value)} placeholder="35202-1234567-1" />
        </Field>
        <Field label="Mobile">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Outstanding amount" required hint={form.customer ? `Current khata balance: ${money(form.customer.balance)}` : undefined}>
          <MoneyInput value={form.amount} onChange={(v) => updateSchedule({ amount: v })} />
        </Field>
        <Field label="Full address" required className="md:col-span-2">
          <Textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Agreement date">
          <Input type="date" value={form.agreementDate} onChange={(e) => updateSchedule({ agreementDate: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repay within (days)">
            <QtyInput allowDecimal={false} value={form.days} onChange={(v) => updateSchedule({ days: v })} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={form.dueDate} min={form.agreementDate} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
        </div>
        <Field label="Number of instalments">
          <QtyInput allowDecimal={false} value={form.installments} onChange={(v) => updateSchedule({ installments: v })} />
        </Field>
        <div />
        <Field label="Payment terms (clause 3)" className="md:col-span-2">
          <Textarea
            rows={3}
            value={form.terms}
            onChange={(e) => {
              setTermsTouched(true);
              set('terms', e.target.value);
            }}
          />
        </Field>
        <Field label="Witness 1 — name">
          <Input value={form.witness1Name} onChange={(e) => set('witness1Name', e.target.value)} />
        </Field>
        <Field label="Witness 1 — CNIC">
          <Input value={form.witness1Cnic} onChange={(e) => set('witness1Cnic', e.target.value)} />
        </Field>
        <Field label="Witness 2 — name">
          <Input value={form.witness2Name} onChange={(e) => set('witness2Name', e.target.value)} />
        </Field>
        <Field label="Witness 2 — CNIC">
          <Input value={form.witness2Cnic} onChange={(e) => set('witness2Cnic', e.target.value)} />
        </Field>
        <Field label="Internal notes (not printed)" className="md:col-span-2">
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
