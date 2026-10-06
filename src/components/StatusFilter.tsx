'use client';

import { TASK_STATUSES, type TaskStatus } from '@/lib/task-status';

/** Filled and idle colors match StatusButtons so the active filter reads as the same chip. */
const ACTIVE: Record<TaskStatus, string> = {
  todo: 'bg-zinc-600 text-zinc-50 border-zinc-400',
  in_progress: 'bg-blue-600 text-white border-blue-400',
  waiting: 'bg-red-600 text-white border-red-400',
  done: 'bg-emerald-600 text-white border-emerald-300',
};

const IDLE: Record<TaskStatus, string> = {
  todo: 'bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-100',
  in_progress: 'bg-transparent text-blue-300/80 border-blue-900 hover:border-blue-500 hover:text-blue-100',
  waiting: 'bg-transparent text-red-300/80 border-red-900 hover:border-red-500 hover:text-red-100',
  done: 'bg-transparent text-emerald-300/80 border-emerald-900 hover:border-emerald-500 hover:text-emerald-100',
};

const CHIP =
  'border font-semibold transition-colors min-h-8 px-2 py-1 text-[11px] leading-none rounded-md whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60';

export function StatusFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (status: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by status"
      className="flex flex-wrap items-center gap-1 w-full sm:w-auto"
    >
      <button
        type="button"
        aria-pressed={value === ''}
        onClick={() => onChange('')}
        className={`${CHIP} ${value === '' ? 'bg-violet-600 text-white border-violet-400' : 'bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-100'}`}
      >
        All
      </button>
      {TASK_STATUSES.map((status) => {
        const active = value === status.value;
        return (
          <button
            key={status.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(status.value)}
            className={`${CHIP} ${active ? ACTIVE[status.value] : IDLE[status.value]}`}
          >
            {status.label}
          </button>
        );
      })}
    </div>
  );
}
