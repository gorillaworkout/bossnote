'use client';

import { TASK_STATUSES } from '@/lib/task-status';

const CHIP =
  'inline-flex items-center justify-center h-7 px-2 text-[11px] font-medium leading-none rounded-md whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60';

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
        className={`${CHIP} ${value === '' ? 'bg-violet-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
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
            className={`${CHIP} ${active ? 'bg-violet-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
          >
            {status.label}
          </button>
        );
      })}
    </div>
  );
}
