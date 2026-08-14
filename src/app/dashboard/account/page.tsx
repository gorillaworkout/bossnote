'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User { id: string; name: string; role: string }
interface Me { id: string; name: string; role: string }

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [current, setCurrent] = useState('');
  const [nextPw, setNextPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [targetId, setTargetId] = useState('');
  const [targetPw, setTargetPw] = useState('');

  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.user) { window.location.href = '/'; return; }
      setMe(d.user);
    }).finally(() => setLoading(false));
    fetch('/api/users').then(r => r.json()).then(d => setUsers(d.users || []));
  }, []);

  const isBoss = me?.role === 'boss';

  const changeOwn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nextPw !== confirm) { setMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    if (nextPw.length < 6) { setMsg({ ok: false, text: 'New password must be at least 6 characters.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/auth/password', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: nextPw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to update password');
      setMsg({ ok: true, text: 'Password updated.' });
      setCurrent(''); setNextPw(''); setConfirm('');
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' }); }
    finally { setBusy(false); }
  };

  const resetUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) { setMsg({ ok: false, text: 'Choose a user.' }); return; }
    if (targetPw.length < 6) { setMsg({ ok: false, text: 'New password must be at least 6 characters.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: targetId, new_password: targetPw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to reset password');
      const name = users.find(u => u.id === targetId)?.name || targetId;
      setMsg({ ok: true, text: `Password reset for ${name}.` });
      setTargetPw('');
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' }); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center"><p className="text-sm text-zinc-600 animate-pulse">Loading…</p></div>;
  if (!me) return null;

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <header className="h-14 flex items-center justify-between px-5 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md overflow-hidden"><img src="/logo.png" className="w-full h-full object-cover" /></div>
          <h1 className="text-[13px] font-semibold text-zinc-100">Account</h1>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-[12px] text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition-colors">← Back to board</button>
      </header>

      <main className="flex-1 max-w-[520px] w-full mx-auto p-5 space-y-5">
        {msg && (
          <div className={`text-[12px] px-3 py-2 rounded-md border ${msg.ok ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400' : 'bg-red-950/30 border-red-900/30 text-red-400'}`}>{msg.text}</div>
        )}

        <section className="card p-5">
          <h2 className="text-[12px] font-semibold text-zinc-200 mb-1">Change your password</h2>
          <p className="text-[11px] text-zinc-600 mb-4">Signed in as <span className="text-zinc-400 font-medium">{me.name}</span></p>
          <form onSubmit={changeOwn} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Current password</label>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required autoComplete="current-password" className="input-field w-full px-3.5 py-2.5 text-[14px]" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">New password</label>
              <input type="password" value={nextPw} onChange={e => setNextPw(e.target.value)} required autoComplete="new-password" className="input-field w-full px-3.5 py-2.5 text-[14px]" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Confirm new password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" className="input-field w-full px-3.5 py-2.5 text-[14px]" />
            </div>
            <button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-[13px] transition-all shadow-[0_2px_8px_rgb(99_102_241/0.2)]">{busy ? 'Saving…' : 'Update password'}</button>
          </form>
        </section>

        {isBoss && (
          <section className="card p-5">
            <h2 className="text-[12px] font-semibold text-zinc-200 mb-1">Reset a user&apos;s password</h2>
            <p className="text-[11px] text-zinc-600 mb-4">Boss only — set a new password for any team member.</p>
            <form onSubmit={resetUser} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">User</label>
                <select value={targetId} onChange={e => setTargetId(e.target.value)} className="input-field w-full px-3 py-2.5 text-[14px] cursor-pointer">
                  <option value="">Choose a user…</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.role === 'boss' ? ' (boss)' : ' (staff)'}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">New password</label>
                <input type="password" value={targetPw} onChange={e => setTargetPw(e.target.value)} required autoComplete="new-password" className="input-field w-full px-3.5 py-2.5 text-[14px]" />
              </div>
              <button type="submit" disabled={busy} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-2.5 rounded-lg text-[13px] transition-colors disabled:opacity-50">{busy ? 'Saving…' : 'Reset password'}</button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
