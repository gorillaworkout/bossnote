'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type HeaderUser = { id: string; name: string; role: string };

export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.assign(`${window.location.origin}/`);
  }
}

function navClass(active: boolean) {
  return `text-[12px] px-2.5 py-1.5 rounded-md transition-colors ${
    active ? 'text-zinc-100 bg-zinc-800' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
  }`;
}

export function DashboardHeader({
  user,
  extra,
  children,
}: {
  user: HeaderUser;
  extra?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const isBoss = user.role === 'boss';

  return (
    <header className="min-h-14 flex items-center justify-between gap-2 px-3 sm:px-5 bg-[var(--surface)] border-b border-[var(--border)] flex-shrink-0 select-none">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-md overflow-hidden flex items-center justify-center shadow-[0_2px_8px_rgb(99_102_241/0.3)] flex-shrink-0">
            <img src="/logo.png" alt="BossNote" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[13px] font-semibold tracking-tight text-zinc-100">BossNote</h1>
            <p className="text-[10px] text-zinc-600 leading-none mt-0.5 truncate">
              {user.name} <span className="text-zinc-700">·</span> {isBoss ? 'Boss' : 'Team'}
            </p>
          </div>
        </Link>
        {children}
      </div>

      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <nav className="flex items-center gap-0.5">
          <Link href="/dashboard" className={navClass(pathname === '/dashboard')}>
            Board
          </Link>
          {isBoss && (
            <Link
              href="/dashboard/users"
              className={navClass(pathname.startsWith('/dashboard/users'))}
              title="Manage Users"
            >
              <span className="sm:hidden">Users</span>
              <span className="hidden sm:inline">Manage Users</span>
            </Link>
          )}
          <Link href="/dashboard/account" className={navClass(pathname.startsWith('/dashboard/account'))}>
            Account
          </Link>
        </nav>
        {extra}
        <button
          type="button"
          onClick={() => { void logout(); }}
          className="text-[12px] font-medium text-zinc-200 hover:text-white px-2.5 py-1.5 rounded-md border border-[var(--border-strong)] hover:bg-zinc-800 transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
