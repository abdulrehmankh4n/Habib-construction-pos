import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS, type Customer, type CustomerType, type PriceTier } from '@pos/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Checkbox, Field, Input, Modal, MoneyInput, Select, Textarea } from './ui';

interface FormState {
  name: string;
  fatherName: string;
  phone: string;
  cnic: string;
  email: string;
  address: string;
  city: string;
  ntn: string;
  strn: string;
  customerType: CustomerType;
  priceTier: PriceTier;
  creditLimit: number | null;
  openingBalance: number | null;
  notes: string;
  isActive: boolean;
}

const blank: FormState = {
  name: '',
  fatherName: '',
  phone: '',
  cnic: '',
  email: '',
  address: '',
  city: '',
  ntn: '',
  strn: '',
  customerType: 'retail',
  priceTier: 'retail',
  creditLimit: null,
  openingBalance: 0,
  notes: '',
  isActive: true,
};

function fromCustomer(c: Customer): FormState {
  return {
    name: c.name,
    fatherName: c.fatherName ?? '',
    phone: c.phone ?? '',
    cnic: c.cnic ?? '',
    email: c.email ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    ntn: c.ntn ?? '',
    strn: c.strn ?? '',
    customerType: c.customerType,
    priceTier: c.priceTier,
    creditLimit: c.creditLimit,
    openingBalance: c.openingBalance,
    notes: c.notes ?? '',
    isActive: c.isActive,
  };
}

export function CustomerFormModal({
  open,
  onClose,
  customer,
  initialName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  initialName?: string;
  onSaved?: (c: Customer) => void;
}) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [form, setForm] = useState<FormState>(blank);
  const [openingSign, setOpeningSign] = useState<'owes' | 'advance'>('owes');
  const canFinance = can('payments.void') || !customer;

  useEffect(() => {
    if (!open) return;
    if (customer) {
      setForm(fromCustomer(customer));
      setOpeningSign(customer.openingBalance < 0 ? 'advance' : 'owes');
    } else {
      setForm({ ...blank, name: initialName ?? '' });
      setOpeningSign('owes');
    }
  }, [open, customer, initialName]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const opening = Math.abs(form.openingBalance ?? 0) * (openingSign === 'advance' ? -1 : 1);
      const body = { ...form, openingBalance: opening, email: form.email || null };
      return customer ? api.put<Customer>(`/customers/${customer.id}`, body) : api.post<Customer>('/customers', body);
    },
    onSuccess: (c) => {
      toast.success(customer ? 'Customer updated' : 'Customer added');
      qc.invalidateQueries({ queryKey: ['customers'] });
      onSaved?.(c);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? `Edit customer — ${customer.name}` : 'New customer'}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate()}>
            {customer ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Full name" required>
          <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Father / Husband name" hint="Used on legal agreements (S/O, D/O, W/O)">
          <Input value={form.fatherName} onChange={(e) => set('fatherName', e.target.value)} />
        </Field>
        <Field label="Mobile number" hint="03XX-XXXXXXX — used for WhatsApp / SMS">
          <Input inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0300-1234567" />
        </Field>
        <Field label="CNIC" hint="13 digits">
          <Input value={form.cnic} onChange={(e) => set('cnic', e.target.value)} placeholder="35202-1234567-1" />
        </Field>
        <Field label="Full address" className="sm:col-span-2">
          <Textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="House, street, area" />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Customer type">
          <Select value={form.customerType} onChange={(e) => set('customerType', e.target.value as CustomerType)}>
            {CUSTOMER_TYPES.map((t) => (
              <option key={t} value={t}>
                {CUSTOMER_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Price level">
          <Select value={form.priceTier} onChange={(e) => set('priceTier', e.target.value as PriceTier)}>
            <option value="retail">Retail price</option>
            <option value="wholesale">Wholesale / contractor price</option>
          </Select>
        </Field>
        <Field label="Credit limit" hint={canFinance ? 'Leave empty for no limit · 0 = cash only' : 'Only a manager can change this'}>
          <MoneyInput value={form.creditLimit} disabled={!canFinance} onChange={(v) => set('creditLimit', v)} />
        </Field>
        <Field label="Opening balance" hint={canFinance ? 'Previous khata balance before using this system' : 'Only a manager can change this'}>
          <div className="flex gap-2">
            <Select className="w-36" value={openingSign} disabled={!canFinance} onChange={(e) => setOpeningSign(e.target.value as 'owes' | 'advance')}>
              <option value="owes">Customer owes</option>
              <option value="advance">Advance paid</option>
            </Select>
            <MoneyInput value={form.openingBalance === null ? null : Math.abs(form.openingBalance)} disabled={!canFinance} onChange={(v) => set('openingBalance', v)} />
          </div>
        </Field>
        <Field label="NTN">
          <Input value={form.ntn} onChange={(e) => set('ntn', e.target.value)} />
        </Field>
        <Field label="STRN">
          <Input value={form.strn} onChange={(e) => set('strn', e.target.value)} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {customer && (
          <div className="sm:col-span-2">
            <Checkbox checked={form.isActive} onChange={(v) => set('isActive', v)} label="Active" description="Inactive customers cannot be selected for new sales" />
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
