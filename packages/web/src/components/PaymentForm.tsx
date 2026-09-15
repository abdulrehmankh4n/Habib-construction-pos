import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@pos/shared';
import { api, errorMessage } from '../lib/api';
import { money, today } from '../lib/format';
import { Button, Field, Input, KeyValue, Modal, MoneyInput, Select, Textarea } from './ui';

export function PaymentModal({
  open,
  onClose,
  party,
  partyId,
  partyName,
  balance,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  party: 'customer' | 'supplier';
  partyId: number;
  partyName: string;
  balance: number;
  onDone?: (result: { id: number; paymentNo: string; balance: number }) => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setAmount(balance > 0 ? balance : null);
      setMethod('cash');
      setReference('');
      setDate(today());
      setNotes('');
    }
  }, [open, balance]);

  const save = useMutation({
    mutationFn: () =>
      api.post<{ id: number; paymentNo: string; balance: number }>(`/${party === 'customer' ? 'customers' : 'suppliers'}/${partyId}/payments`, {
        amount,
        method,
        reference: reference || null,
        paymentDate: date,
        notes: notes || null,
      }),
    onSuccess: (r) => {
      toast.success(`${r.paymentNo} recorded. New balance ${money(r.balance)}`);
      qc.invalidateQueries({ queryKey: [party === 'customer' ? 'customers' : 'suppliers'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      onDone?.(r);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={party === 'customer' ? `Receive payment — ${partyName}` : `Pay supplier — ${partyName}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!amount} loading={save.isPending} onClick={() => save.mutate()}>
            {party === 'customer' ? 'Receive' : 'Pay'} {amount ? money(amount) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md bg-slate-50 p-3">
          <KeyValue label={party === 'customer' ? 'Customer owes' : 'We owe supplier'} value={money(balance)} />
          {amount ? <KeyValue label="Balance after this payment" value={money(balance - amount)} /> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount" required>
            <MoneyInput autoFocus value={amount} onChange={setAmount} />
          </Field>
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={method === 'cheque' ? 'Cheque no. / bank' : 'Reference / Txn ID'}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function BalanceAdjustModal({ open, onClose, party, partyId }: { open: boolean; onClose: () => void; party: 'customer' | 'supplier'; partyId: number }) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<'increase' | 'decrease'>('decrease');
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => api.post(`/${party === 'customer' ? 'customers' : 'suppliers'}/${partyId}/adjustments`, { direction, amount, reason }),
    onSuccess: () => {
      toast.success('Balance adjusted');
      qc.invalidateQueries({ queryKey: [party === 'customer' ? 'customers' : 'suppliers'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Balance adjustment"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!amount || !reason.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Type">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as 'increase' | 'decrease')}>
            <option value="decrease">Decrease balance (discount / write-off)</option>
            <option value="increase">Increase balance (correction)</option>
          </Select>
        </Field>
        <Field label="Amount" required>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Reason" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. settlement discount" />
        </Field>
      </div>
    </Modal>
  );
}
