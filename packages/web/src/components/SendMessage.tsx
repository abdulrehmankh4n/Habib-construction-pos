import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MessageCircle, MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Input, Modal, Spinner, Textarea } from './ui';

type MessageType = 'sale' | 'payment' | 'reminder';

interface Preview {
  phone: string | null;
  message: string;
  whatsappUrl: string;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
}

function whatsappLink(phone: string, message: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `92${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('3')) digits = `92${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function SendMessageModal({ open, onClose, type, id, channel }: { open: boolean; onClose: () => void; type: MessageType; id: number; channel: 'whatsapp' | 'sms' }) {
  const preview = useQuery({
    queryKey: ['notifications', 'preview', type, id, channel],
    queryFn: () => api.get<Preview>('/notifications/preview', { type, id, channel }),
    enabled: open,
  });
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (preview.data) {
      setPhone(preview.data.phone ?? '');
      setMessage(preview.data.message);
    }
  }, [preview.data]);

  const sms = useMutation({
    mutationFn: () => api.post('/notifications/sms', { type, id, phone: phone || null, message }),
    onSuccess: () => {
      toast.success('SMS sent');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const openWhatsapp = () => {
    const url = phone ? whatsappLink(phone, message) : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener');
    api.post('/notifications/whatsapp-log', { type, id, phone: phone || null, message }).catch(() => undefined);
    onClose();
  };

  const disabled = channel === 'sms' ? !preview.data?.smsEnabled : !preview.data?.whatsappEnabled;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={channel === 'whatsapp' ? 'Send on WhatsApp' : 'Send SMS'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {channel === 'whatsapp' ? (
            <Button variant="success" icon={<MessageCircle className="h-4 w-4" />} disabled={disabled || !message} onClick={openWhatsapp}>
              Open WhatsApp
            </Button>
          ) : (
            <Button variant="primary" icon={<MessageSquareText className="h-4 w-4" />} disabled={disabled || !phone || !message} loading={sms.isPending} onClick={() => sms.mutate()}>
              Send SMS
            </Button>
          )}
        </>
      }
    >
      {preview.isLoading ? (
        <Spinner />
      ) : preview.error ? (
        <p className="text-sm text-red-600">{errorMessage(preview.error)}</p>
      ) : (
        <div className="space-y-3">
          {disabled && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {channel === 'sms'
                ? 'SMS gateway is not configured. An administrator can set it up in Settings → Notifications.'
                : 'WhatsApp sharing is turned off in Settings → Notifications.'}
            </p>
          )}
          <Field label="Mobile number" hint={channel === 'whatsapp' ? 'Leave empty to pick a contact inside WhatsApp' : 'Pakistani mobile number'}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300-1234567" />
          </Field>
          <Field label="Message">
            <Textarea rows={10} value={message} onChange={(e) => setMessage(e.target.value)} className="font-mono text-xs" />
          </Field>
          {channel === 'sms' && <p className="text-xs text-slate-500">{message.length} characters (~{Math.max(1, Math.ceil(message.length / 153))} SMS)</p>}
        </div>
      )}
    </Modal>
  );
}

export function SendMessageButtons({ type, id, size = 'sm' }: { type: MessageType; id: number; size?: 'xs' | 'sm' | 'md' }) {
  const { can } = useAuth();
  const [channel, setChannel] = useState<'whatsapp' | 'sms' | null>(null);
  if (!can('notifications.send')) return null;
  return (
    <>
      <Button size={size} icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={() => setChannel('whatsapp')}>
        WhatsApp
      </Button>
      <Button size={size} icon={<MessageSquareText className="h-4 w-4 text-sky-600" />} onClick={() => setChannel('sms')}>
        SMS
      </Button>
      {channel && <SendMessageModal open onClose={() => setChannel(null)} type={type} id={id} channel={channel} />}
    </>
  );
}
