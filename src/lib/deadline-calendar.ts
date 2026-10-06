export type DateParts = { year: number; month: number; day: number };

export type CalendarCell = { iso: string; day: number; inMonth: boolean };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

/** Parse a date-only deadline. Invalid calendar days return null. */
export function parseIsoDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  return { year, month, day };
}

export function toIsoDate(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function formatDeadlineLabel(value: string): string {
  const parts = parseIsoDate(value);
  if (!parts) return '';
  return `${parts.day} ${MONTHS_SHORT[parts.month - 1]} ${parts.year}`;
}

export function formatMonthTitle(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export function todayParts(now = new Date()): DateParts {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total - nextYear * 12;
  return { year: nextYear, month: nextMonth + 1 };
}

/** Monday-first month grid, always 6 weeks so the sheet height stays stable. */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month - 1, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month - 1, 1 - mondayOffset);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const parts = { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
    cells.push({
      iso: toIsoDate(parts),
      day: parts.day,
      inMonth: parts.year === year && parts.month === month,
    });
  }
  return cells;
}

/** Viewport coordinates for a calendar popup anchored to the deadline button. */
export function popupPosition(args: {
  trigger: { top: number; bottom: number; left: number; right: number };
  viewport: { width: number; height: number };
  popupWidth?: number;
  popupHeight?: number;
}): { top: number; left: number; width: number } {
  const margin = 8;
  const width = Math.min(args.popupWidth ?? 320, Math.max(240, args.viewport.width - margin * 2));
  const height = args.popupHeight ?? 420;
  let top = args.trigger.bottom + margin;
  if (top + height > args.viewport.height - margin) {
    const above = args.trigger.top - height - margin;
    top = above >= margin ? above : Math.max(margin, args.viewport.height - height - margin);
  }
  let left = args.trigger.right - width;
  if (left < margin) left = margin;
  if (left + width > args.viewport.width - margin) left = Math.max(margin, args.viewport.width - margin - width);
  return { top, left, width };
}
