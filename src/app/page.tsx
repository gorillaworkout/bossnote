'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-5">
      <div className="w-full max-w-[340px]">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center mx-auto mb-5 shadow-[0_4px_16px_rgb(99_102_241/0.3)]">
            <img src="/logo.svg" alt="BossNote" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">BossNote</h1>
          <p className="text-[13px] text-zinc-500 mt-1">Sign in to continue</p>
        </div>

        <form onSubmit={handleLogin} className="card p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="ian"
              required
              autoComplete="username"
              className="input-field w-full px-3.5 py-2.5 text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="input-field w-full px-3.5 py-2.5 text-[14px]"
            />
          </div>
          {error && <p className="text-[12px] text-red-400 bg-red-950/30 border border-red-900/30 rounded-md px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-[13px] transition-all shadow-[0_2px_8px_rgb(99_102_241/0.2)]"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
