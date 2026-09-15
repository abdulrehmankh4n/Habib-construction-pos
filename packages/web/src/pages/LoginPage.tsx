import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { Button, Field, Input } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="h-14 w-14" />
          <h1 className="mt-3 text-2xl font-semibold text-white">Construction POS</h1>
          <p className="text-sm text-slate-300">Building materials · Hardware · Sanitary</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6 shadow-xl">
          <Field label="Username" htmlFor="username">
            <div className="relative">
              <User className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input id="username" className="pl-8" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
          </Field>
          <Field label="Password" htmlFor="password">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input id="password" className="pl-8" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </Field>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
