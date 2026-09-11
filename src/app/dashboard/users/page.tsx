'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardHeader } from '@/components/DashboardHeader';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

function fmtCreated(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ManageUsersPage() {
  const [me, setMe] = useState<{ id: string; name: string; role: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [newName, setNewName] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newRole, setNewRole] = useState<'boss' | 'member'>('member');

  const [editing, setEditing] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'boss' | 'member'>('member');

  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  const [resetting, setResetting] = useState<User | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');

  const router = useRouter();

  const load = async () => {
    const r = await fetch('/api/admin/users');
    const d = await r.json();
    if (!r.ok) {
      setMsg({ ok: false, text: d.error || 'Failed to load users' });
      setUsers([]);
      return;
    }
    setUsers(d.users || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).then(r => r.json());
        if (cancelled) return;
        if (!d.user) {
          window.location.assign(`${window.location.origin}/`);
          return;
        }
        setMe(d.user);
        if (d.user.role !== 'boss') {
          router.push('/dashboard');
          return;
        }
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 6) { setMsg({ ok: false, text: 'Password must be at least 6 characters.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), password: newPw, role: newRole }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to add user');
      setMsg({ ok: true, text: `Added ${d.user.name}.` });
      setNewName(''); setNewPw(''); setNewRole('member');
      await load();
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' }); }
    finally { setBusy(false); }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/admin/users/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), role: editRole }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to update user');
      setMsg({ ok: true, text: `Updated ${d.user.name}.` });
      setEditing(null); await load();
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' }); }
    finally { setBusy(false); }
  };

  const deleteUser = async () => {
    if (!confirmDelete) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/admin/users/${confirmDelete.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to delete user');
      setMsg({ ok: true, text: `Deleted ${confirmDelete.name}.` });
      setConfirmDelete(null); await load();
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' }); }
    finally { setBusy(false); }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetting) return;
    if (resetPw.length < 6) { setMsg({ ok: false, text: 'New password must be at least 6 characters.' }); return; }
    if (resetPw !== resetConfirm) { setMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: resetting.id, new_password: resetPw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to reset password');
      setMsg({ ok: true, text: `Password reset for ${resetting.name}.` });
      setResetting(null); setResetPw(''); setResetConfirm('');
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' }); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center"><p className="text-sm text-zinc-600 animate-pulse">Loading…</p></div>;
  if (!me) return null;

  const bossCount = users.filter(u => u.role === 'boss').length;
  const canDelete = (u: User) => u.id !== me.id && !(u.role === 'boss' && bossCount <= 1);

  const roleBadge = (role: string) => (
    <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase tracking-wider ${role === 'boss' ? 'bg-violet-950/50 text-violet-300' : 'bg-zinc-800 text-zinc-400'}`}>{role === 'boss' ? 'Boss' : 'Staff'}</span>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <DashboardHeader user={me} />

      <main className="flex-1 max-w-[760px] w-full mx-auto p-5 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-100">Manage Users</h2>
          <p className="text-[12px] text-zinc-500 mt-0.5">Add, edit, or remove accounts. Staff see only their own tasks; bosses see everything.</p>
        </div>

        {msg && (
          <div className={`text-[12px] px-3 py-2 rounded-md border ${msg.ok ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400' : 'bg-red-950/30 border-red-900/30 text-red-400'}`}>{msg.text}</div>
        )}

        <section className="card p-5">
          <h3 className="text-[12px] font-semibold text-zinc-200 mb-1">Add a new user</h3>
          <p className="text-[11px] text-zinc-600 mb-4">Login is by name (case-insensitive). Share the password securely — it is not shown again.</p>
          <form onSubmit={addUser} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required placeholder="e.g. Rina" autoComplete="off" className="input-field w-full px-3 py-2.5 text-[14px]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value as 'boss' | 'member')} className="input-field w-full px-3 py-2.5 text-[14px] cursor-pointer">
                  <option value="member">Staff</option>
                  <option value="boss">Boss</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Password (min 6 chars)</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required autoComplete="new-password" className="input-field w-full px-3.5 py-2.5 text-[14px]" />
            </div>
            <button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-[13px] transition-all shadow-[0_2px_8px_rgb(99_102_241/0.2)]">{busy ? 'Adding…' : 'Add user'}</button>
          </form>
        </section>

        <section className="card p-5">
          <h3 className="text-[12px] font-semibold text-zinc-200 mb-4">Team ({users.length})</h3>
          {users.length === 0 ? (
            <p className="text-[12px] text-zinc-600 italic">No users found.</p>
          ) : (
            <ul className="space-y-1">
              {users.map(u => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-zinc-200">{u.name}</span>
                      {u.id === me.id && <span className="text-[10px] text-zinc-600">(you)</span>}
                      {roleBadge(u.role)}
                    </div>
                    <p className="text-[11px] text-zinc-600 truncate">{u.email}</p>
                    <p className="text-[10px] text-zinc-700 mt-0.5">Created {fmtCreated(u.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => { setEditing(u); setEditName(u.name); setEditRole(u.role === 'boss' ? 'boss' : 'member'); }}
                      className="text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded-md hover:bg-zinc-800 transition-colors"
                    >
                      Edit
                    </button>
                    {u.id !== me.id && (
                      <button
                        type="button"
                        onClick={() => { setResetting(u); setResetPw(''); setResetConfirm(''); setMsg(null); }}
                        className="text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded-md hover:bg-zinc-800 transition-colors"
                      >
                        Reset
                      </button>
                    )}
                    {canDelete(u) && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(u)}
                        className="text-[11px] text-red-400/80 hover:text-red-400 px-2 py-1 rounded-md hover:bg-red-950/30 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-5" onClick={() => setEditing(null)}>
          <div className="card-raised p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-zinc-100 mb-4">Edit user</h3>
            <form onSubmit={saveEdit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} required className="input-field w-full px-3 py-2.5 text-[14px]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Role</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value as 'boss' | 'member')}
                  disabled={editing.id === me.id}
                  className="input-field w-full px-3 py-2.5 text-[14px] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="member">Staff</option>
                  <option value="boss">Boss</option>
                </select>
                {editing.id === me.id && (
                  <p className="text-[11px] text-zinc-600 mt-1.5">You cannot change your own role.</p>
                )}
              </div>
              <div className="flex gap-2.5 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[13px] font-medium py-2 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={busy} className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-[13px] font-medium py-2 rounded-lg transition-all">{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetting && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-5" onClick={() => setResetting(null)}>
          <div className="card-raised p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-zinc-100 mb-1">Reset password</h3>
            <p className="text-[13px] text-zinc-500 mb-4">Set a new password for <span className="text-zinc-300 font-medium">{resetting.name}</span>.</p>
            <form onSubmit={resetPassword} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">New password</label>
                <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)} required autoComplete="new-password" className="input-field w-full px-3 py-2.5 text-[14px]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Confirm password</label>
                <input type="password" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} required autoComplete="new-password" className="input-field w-full px-3 py-2.5 text-[14px]" />
              </div>
              <div className="flex gap-2.5 pt-2">
                <button type="button" onClick={() => setResetting(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[13px] font-medium py-2 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={busy} className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-[13px] font-medium py-2 rounded-lg transition-all">{busy ? 'Saving…' : 'Reset'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-5" onClick={() => setConfirmDelete(null)}>
          <div className="card-raised p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-center text-zinc-100">Delete {confirmDelete.name}?</h3>
            <p className="text-[13px] text-zinc-500 text-center mt-1.5 leading-relaxed">This user&apos;s account will be removed. This cannot be undone.</p>
            <div className="flex gap-2.5 mt-5">
              <button type="button" onClick={() => setConfirmDelete(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[13px] font-medium py-2 rounded-lg transition-colors">Cancel</button>
              <button type="button" onClick={deleteUser} disabled={busy} className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-[13px] font-medium py-2 rounded-lg transition-colors shadow-[0_2px_8px_rgb(239_68_68/0.2)]">{busy ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
