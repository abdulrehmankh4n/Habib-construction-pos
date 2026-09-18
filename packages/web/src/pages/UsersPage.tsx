import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Pencil, UserPlus } from 'lucide-react';
import { ROLES, ROLE_LABELS, ROLE_PERMISSIONS, type Role, type User } from '@pos/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTimeLabel } from '../lib/format';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, TableWrap } from '../components/ui';

function UserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    username: user?.username ?? '',
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    role: (user?.role ?? 'cashier') as Role,
    password: '',
    isActive: user?.isActive ?? true,
  });
  const save = useMutation({
    mutationFn: () =>
      user
        ? api.put(`/users/${user.id}`, { fullName: form.fullName, phone: form.phone || null, role: form.role, isActive: form.isActive })
        : api.post('/users', { username: form.username, fullName: form.fullName, phone: form.phone || null, role: form.role, password: form.password }),
    onSuccess: () => {
      toast.success(user ? 'User updated' : 'User created — they must change the password at first login');
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={user ? `Edit user — ${user.username}` : 'New user'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={!form.fullName.trim() || (!user && (!form.username.trim() || form.password.length < 6))} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!user && (
          <Field label="Username" required hint="Letters, numbers, dot, dash and underscore">
            <Input autoFocus value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
        )}
        <Field label="Full name" required>
          <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Role" hint={`${ROLE_PERMISSIONS[form.role].length} permissions`}>
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        {!user && (
          <Field label="Temporary password" required hint="The user must change it at first login">
            <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
        )}
        {user && <Checkbox checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Active" description="Deactivating signs the user out immediately" />}
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const save = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/reset-password`, { password }),
    onSuccess: () => {
      toast.success(`Password reset for ${user.username}`);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Reset password — ${user.username}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={password.length < 6} loading={save.isPending} onClick={() => save.mutate()}>
            Reset password
          </Button>
        </>
      }
    >
      <Field label="New temporary password" required hint="The user will be asked to change it at next login">
        <Input autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/users') });

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Owner, managers and counter staff with role-based access"
        actions={
          <Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            Add user
          </Button>
        }
      />
      <Card bodyClassName="p-0">
        {isLoading ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState title="No users" />
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Last login</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <p className="font-medium text-slate-800">
                        {u.fullName} {u.id === me?.id && <Badge color="brand">You</Badge>}
                      </p>
                      <p className="text-xs text-slate-500">{u.username}</p>
                    </td>
                    <td>
                      <Badge color={u.role === 'admin' ? 'brand' : u.role === 'manager' ? 'blue' : 'gray'}>{ROLE_LABELS[u.role]}</Badge>
                    </td>
                    <td className="text-slate-600">{u.phone ?? '—'}</td>
                    <td className="text-slate-600">{u.lastLoginAt ? dateTimeLabel(u.lastLoginAt) : 'Never'}</td>
                    <td>
                      {u.isActive ? <Badge color="green">Active</Badge> : <Badge color="red">Disabled</Badge>}
                      {u.mustChangePassword && <Badge color="amber" className="ml-1">Must change password</Badge>}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button size="xs" icon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => setResetting(u)}>
                          Reset password
                        </Button>
                        <Button size="xs" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(u)}>
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <Card title="What each role can do" className="mt-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r}>
              <p className="mb-1 font-medium text-slate-800">{ROLE_LABELS[r]}</p>
              <ul className="space-y-0.5 text-xs text-slate-600">
                {r === 'admin' && <li>Full access including users, settings and backups</li>}
                {r === 'manager' && <li>Everything except users and settings</li>}
                {r === 'cashier' && (
                  <>
                    <li>POS sales, quotations and deliveries</li>
                    <li>Customers and receiving payments</li>
                    <li>Cannot see cost prices, profit or reports</li>
                    <li>Cannot cancel sales or give below-minimum prices</li>
                  </>
                )}
              </ul>
            </div>
          ))}
        </div>
      </Card>
      {creating && <UserModal user={null} onClose={() => setCreating(false)} />}
      {editing && <UserModal user={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}
