'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string; name: string; email: string; role: string; created_at: string;
}

export default function ManageUsersPage() {
  const [me, setMe] = useState<{ id: string; name: string; role: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Add form
  const [newName, setNewName] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newRole, setNewRole] = useState<'boss' | 'member'>('member');

  // Edit state
  const [editing, setEditing] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'boss' | 'member'>('member');

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  const router = useRouter();

  const load = () => {
    fetch('/api/admin/users').then(r => r.json()).then(d => setUsers(d.users || []));
  };

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.user) { window.location.href = '/'; return; }
      setMe(d.user);
      if (d.user.role !== 'boss') { router.push('/dashboard'); return; }
    }).finally(() => setLoading(false));
    load();
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
      load();
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
      setEditing(null); load();
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
      setConfirmDelete(null); load();
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' }); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center"><p className="text-sm text-zinc-600 animate-pulse">Loading…</p></div>;
  if (!me) return null;

  const roleBadge = (role: string) => (
    <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase tracking-wider ${role === 'boss' ? 'bg-violet-950/50 text-violet-300' : 'bg-zinc-800 text-zinc-400'}`}>{role === 'boss' ? 'Boss' : 'Staff'}</span>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <header className="h-14 flex items-center justify-between px-5 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md overflow-hidden"><img src="/logo.png" className="w-full h-full object-cover" /></div>
          <h1 className="text-[13px] font-semibold text-zinc-100">Manage Users</h1>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-[12px] text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition-colors">← Back to board</button>
      </header>

      <main className="flex-1 max-w-[640px] w-full mx-auto p-5 space-y-5">
        {msg && (
          <div className={`text-[12px] px-3 py-2 rounded-md border ${msg.ok ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400' : 'bg-red-950/30 border-red-900/30 text-red-400'}`}>{msg.text}</div>
        )}

        {/* Add user */}
        <section className="card p-5">
          <h2 className="text-[12px] font-semibold text-zinc-200 mb-1">Add a new user</h2>
          <p className="text-[11px] text-zinc-600 mb-4">Staff can see their own tasks; bosses see everything.</p>
          <form onSubmit={addUser} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required placeholder="e.g. Rina" className="input-field w-full px-3 py-2.5 text-[14px]" />
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
              <input type="text" value={newPw} onChange={e => setNewPw(e.target.value)} required autoComplete="off" className="input-field w-full px-3.5 py-2.5 text-[14px]" />
            </div>
            <button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-[13px] transition-all shadow-[0_2px_8px_rgb(99_102_241/0.2)]">{busy ? 'Adding…' : 'Add user'}</button>
          </form>
        </section>

        {/* User list */}
        <section className="card p-5">
          <h2 className="text-[12px] font-semibold text-zinc-200 mb-4">Team ({users.length})</h2>
          <ul className="space-y-2">
            {users.map(u => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-zinc-200">{u.name}</span>
                    {u.id === me.id && <span className="text-[10px] text-zinc-600">(you)</span>}
                    {roleBadge(u.role)}
                  </div>
                  <p className="text-[11px] text-zinc-600 truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => { setEditing(u); setEditName(u.name); setEditRole(u.role === 'boss' ? 'boss' : 'member'); }} className="text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded-md hover:bg-zinc-800 transition-colors">Edit</button>
                  {u.id !== me.id && (
                    <button onClick={() => setConfirmDelete(u)} className="text-[11px] text-red-400/80 hover:text-red-400 px-2 py-1 rounded-md hover:bg-red-950/30 transition-colors">Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-zinc-700 mt-4">Password changes are done in the Account page (boss can reset any user there).</p>
        </section>
      </main>

      {/* Edit modal */}
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
                <select value={editRole} onChange={e => setEditRole(e.target.value as 'boss' | 'member')} className="input-field w-full px-3 py-2.5 text-[14px] cursor-pointer">
                  <option value="member">Staff</option>
                  <option value="boss">Boss</option>
                </select>
              </div>
              <div className="flex gap-2.5 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[13px] font-medium py-2 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={busy} className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-[13px] font-medium py-2 rounded-lg transition-all">{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-5" onClick={() => setConfirmDelete(null)}>
          <div className="card-raised p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-center text-zinc-100">Delete {confirmDelete.name}?</h3>
            <p className="text-[13px] text-zinc-500 text-center mt-1.5 leading-relaxed">This user&apos;s account will be removed. This cannot be undone.</p>
            <div className="flex gap-2.5 mt-5">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[13px] font-medium py-2 rounded-lg transition-colors">Cancel</button>
              <button onClick={deleteUser} disabled={busy} className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-[13px] font-medium py-2 rounded-lg transition-colors shadow-[0_2px_8px_rgb(239_68_68/0.2)]">{busy ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
