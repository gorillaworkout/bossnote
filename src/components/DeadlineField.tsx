'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  formatDeadlineLabel,
  formatMonthTitle,
  parseIsoDate,
  popupPosition,
  shiftMonth,
  todayParts,
  toIsoDate,
} from '@/lib/deadline-calendar';

type DeadlineFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

type PopupBox = { top: number; left: number; width: number };

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

function measurePopup(trigger: HTMLElement): PopupBox {
  const rect = trigger.getBoundingClientRect();
  return popupPosition({
    trigger: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    viewport: { width: window.innerWidth, height: window.innerHeight },
  });
}

export function DeadlineField({ value, onChange, disabled }: DeadlineFieldProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<PopupBox | null>(null);
  const [cursor, setCursor] = useState(() => {
    const parsed = parseIsoDate(value);
    const base = parsed ?? todayParts();
    return { year: base.year, month: base.month };
  });
  const cells = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const todayIso = toIsoDate(todayParts());
  const label = formatDeadlineLabel(value);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onMove = () => {
      if (buttonRef.current) setBox(measurePopup(buttonRef.current));
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    const parsed = parseIsoDate(value);
    const base = parsed ?? todayParts();
    setCursor({ year: base.year, month: base.month });
    if (buttonRef.current) setBox(measurePopup(buttonRef.current));
    setOpen(true);
  };

  const popup = open && box ? createPortal(
    <div className="fixed z-[80] inset-0">
      <button type="button" aria-label="Close calendar" className="absolute inset-0 cursor-default" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-label="Deadline calendar"
        className="absolute z-10 rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] p-2.5 shadow-[0_12px_40px_rgb(0_0_0/0.45)]"
        style={{ top: box.top, left: box.left, width: box.width }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <button type="button" aria-label="Previous month" onClick={() => setCursor((current) => shiftMonth(current.year, current.month, -1))} className="min-h-11 min-w-11 rounded-md text-zinc-300 hover:bg-zinc-800">‹</button>
          <p className="text-[13px] font-medium text-zinc-100">{formatMonthTitle(cursor.year, cursor.month)}</p>
          <button type="button" aria-label="Next month" onClick={() => setCursor((current) => shiftMonth(current.year, current.month, 1))} className="min-h-11 min-w-11 rounded-md text-zinc-300 hover:bg-zinc-800">›</button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAY_LABELS.map((day) => (
            <div key={day} className="text-center text-[10px] font-semibold text-zinc-500 uppercase tracking-wider py-1">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label="Calendar">
          {cells.map((cell) => {
            const selected = cell.iso === value;
            const isToday = cell.iso === todayIso;
            return (
              <button
                key={cell.iso}
                type="button"
                role="gridcell"
                aria-selected={selected}
                aria-label={formatDeadlineLabel(cell.iso)}
                onClick={() => { onChange(cell.iso); setOpen(false); }}
                className={`min-h-11 rounded-md text-[13px] font-medium tabular-nums ${selected ? 'bg-violet-600 text-white' : cell.inMonth ? 'text-zinc-100 hover:bg-zinc-800' : 'text-zinc-600 hover:bg-zinc-800/70'} ${isToday && !selected ? 'ring-1 ring-violet-400/70' : ''}`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="min-h-11 px-3 text-[13px] text-zinc-400 hover:text-zinc-200">Clear</button>
          <button
            type="button"
            onClick={() => {
              const today = todayParts();
              onChange(toIsoDate(today));
              setCursor({ year: today.year, month: today.month });
              setOpen(false);
            }}
            className="min-h-11 px-3 text-[13px] font-medium text-violet-300 hover:text-violet-200"
          >
            Today
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div>
      <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Deadline</label>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Choose deadline"
        onClick={toggle}
        className="input-field px-2.5 py-2 text-[13px] w-full min-h-11 text-left flex items-center justify-between gap-2 disabled:opacity-40"
      >
        <span className={label ? 'text-zinc-100' : 'text-zinc-500'}>{label || 'Pick a date'}</span>
        <span className="text-zinc-300 shrink-0"><CalendarIcon /></span>
      </button>
      {popup}
    </div>
  );
}
