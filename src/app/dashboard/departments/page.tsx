'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardHeader } from '@/components/DashboardHeader';

type Department = {
  id: string;
  name: string;
  created_at: string;
  boss_count: number;
  member_count: number;
};

type Me = { id: string; name: string; role: string };

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function ManageDepartmentsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Department | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const r = await fetch('/api/admin/departments', { credentials: 'include', cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) {
      setMsg({ ok: false, text: d.error || 'Failed to load departments' });
      return;
    }
    setDepartments(d.departments || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).then((r) => r.json());
        if (cancelled) return;
        if (!d.user) {
          window.location.assign('/');
          return;
        }
        if (d.user.role !== 'admin') {
          router.push('/dashboard');
          return;
        }
        setMe(d.user);
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const addDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to add department');
      setNewName('');
      setMsg({ ok: true, text: `Added ${d.department?.name || newName.trim()}.` });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/departments/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to rename department');
      setEditing(null);
      setMsg({ ok: true, text: `Renamed to ${d.department?.name || editName.trim()}.` });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  };

  const deleteDepartment = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    setMsg(null);
    const target = confirmDelete;
    try {
      const r = await fetch(`/api/admin/departments/${target.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ ok: false, text: d.error || 'Failed to delete department' });
        setConfirmDelete(null);
        await load();
        return;
      }
      setConfirmDelete(null);
      setMsg({ ok: true, text: `Deleted ${target.name}.` });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading || !me) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <p className="text-sm text-zinc-600 animate-pulse">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <DashboardHeader user={me} />
      <main className="flex-1 max-w-[760px] w-full mx-auto p-5 space-y-5">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-100">Manage Departments</h2>
          <p className="text-[12px] text-zinc-500 mt-0.5">Add a department, rename it, or delete it after everyone has moved.</p>
        </div>

        {msg && (
          <div className={`text-[12px] px-3 py-2 rounded-md border ${msg.ok ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400' : 'bg-red-950/30 border-red-900/30 text-red-400'}`}>{msg.text}</div>
        )}

        <section className="card p-5">
          <h3 className="text-[12px] font-semibold text-zinc-200 mb-4">Add a department</h3>
          <form onSubmit={addDepartment} className="space-y-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              placeholder="Department name"
              className="input-field w-full px-3 py-2.5 text-[14px]"
            />
            <button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-[13px] transition-all shadow-[0_2px_8px_rgb(99_102_241/0.2)]">
              {busy ? 'Saving…' : 'Add department'}
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h3 className="text-[12px] font-semibold text-zinc-200 mb-4">Departments ({departments.length})</h3>
          {departments.length === 0 ? (
            <p className="text-[12px] text-zinc-600 italic">No departments yet.</p>
          ) : (
            <ul className="space-y-1">
              {departments.map((department) => (
                <li key={department.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-zinc-200">{department.name}</p>
                    <p className="text-[11px] text-zinc-600">
                      {countLabel(department.boss_count, 'boss', 'bosses')} · {department.member_count} staff
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => { setEditing({ id: department.id, name: department.name }); setEditName(department.name); }}
                      className="text-[12px] text-zinc-300 hover:text-white px-2 py-1"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(department)}
                      className="text-[12px] text-red-400 hover:text-red-300 px-2 py-1"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {editing && (
          <section className="card p-5">
            <h3 className="text-[12px] font-semibold text-zinc-200 mb-3">Rename {editing.name}</h3>
            <form onSubmit={saveRename} className="space-y-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="input-field w-full px-3 py-2.5 text-[14px]"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium py-2.5 rounded-lg text-[13px] disabled:opacity-50">
                  Save
                </button>
                <button type="button" onClick={() => setEditing(null)} className="px-4 text-[13px] text-zinc-400">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {confirmDelete && (
          <section className="card p-5">
            <p className="text-[13px] text-zinc-200 mb-3">
              Delete {confirmDelete.name}? People in this department must be moved first.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => { void deleteDepartment(); }}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-[13px]"
              >
                Delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(null)} className="px-4 text-[13px] text-zinc-400">
                Cancel
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
