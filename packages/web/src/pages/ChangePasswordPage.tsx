import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { SessionUser } from '@pos/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Input } from '../components/ui';

export function ChangePasswordPage({ forced }: { forced?: boolean }) {
  const { setUser, logout, user } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 6) return setError('New password must be at least 6 characters');
    if (next !== confirm) return setError('New passwords do not match');
    setBusy(true);
    try {
      const u = await api.post<SessionUser>('/auth/change-password', { currentPassword: current, newPassword: next });
      setUser(u);
      toast.success('Password changed');
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Change password</h1>
        {forced && (
          <p className="mt-1 text-sm text-slate-500">
            Welcome {user?.fullName}. For security, please set a new password before continuing.
          </p>
        )}
      </div>
      <Field label="Current password">
        <Input type="password" autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <Field label="New password" hint="At least 6 characters">
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
      </Field>
      <Field label="Confirm new password">
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" className="flex-1" loading={busy}>
          Update password
        </Button>
        {forced && (
          <Button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Sign out
          </Button>
        )}
      </div>
    </form>
  );

  if (forced) return <div className="flex min-h-full items-center justify-center p-4">{form}</div>;
  return <div className="flex justify-center pt-6">{form}</div>;
}
