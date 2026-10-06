'use client';

import { TASK_STATUSES, type TaskStatus } from '@/lib/task-status';

const ACTIVE: Record<TaskStatus, string> = {
  todo: 'bg-zinc-600 text-zinc-50 border-zinc-500',
  in_progress: 'bg-blue-600 text-white border-blue-500',
  waiting: 'bg-red-600 text-white border-red-500',
  done: 'bg-emerald-600 text-white border-emerald-500',
};

const IDLE: Record<TaskStatus, string> = {
  todo: 'bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200',
  in_progress: 'bg-transparent text-blue-300/80 border-blue-900 hover:border-blue-500 hover:text-blue-100',
  waiting: 'bg-transparent text-red-300/80 border-red-900 hover:border-red-500 hover:text-red-100',
  done: 'bg-transparent text-emerald-300/80 border-emerald-900 hover:border-emerald-500 hover:text-emerald-100',
};

export function StatusButtons({
  value,
  onChange,
  disabled = false,
  size = 'default',
}: {
  value: string;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
  size?: 'compact' | 'default';
}) {
  const compact = size === 'compact';
  return (
    <div
      role="group"
      aria-label="Task status"
      onClick={(event) => event.stopPropagation()}
      className="flex flex-wrap gap-1"
    >
      {TASK_STATUSES.map((status) => {
        const active = value === status.value;
        return (
          <button
            key={status.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            title={status.label}
            onClick={(event) => {
              event.stopPropagation();
              if (disabled || active) return;
              onChange(status.value);
            }}
            className={[
              'inline-flex items-center justify-center border font-medium leading-none transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60',
              'disabled:cursor-wait',
              compact ? 'h-6 px-1.5 text-[10px] rounded' : 'h-7 px-2 text-[11px] rounded-md',
              active ? ACTIVE[status.value] : IDLE[status.value],
              !active && disabled ? 'opacity-50' : '',
            ].join(' ')}
          >
            {size === 'compact' ? status.shortLabel : status.label}
          </button>
        );
      })}
    </div>
  );
}
