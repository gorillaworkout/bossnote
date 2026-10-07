export type TitledTask = {
  title: string;
  title_id?: string | null;
};

export type TaskHeading = {
  primary: string;
  secondary: string;
};

const URL_IN_TEXT = /(?:https?:\/\/|www\.)[^\s]+/gi;
const GENERIC_URL_SEGMENT = new Set([
  'edit', 'view', 'index', 'home', 'share', 'login', 'open',
  'document', 'documents', 'file', 'files', 'folder', 'folders',
]);

function collapseSpace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isShouting(value: string): boolean {
  const letters = value.replace(/[^A-Za-z]/g, '');
  return letters.length >= 8 && letters === letters.toUpperCase();
}

function humanizeSlug(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function urlTitleLabel(raw: string): string {
  const cleaned = raw.replace(/[.,);]+$/g, '');
  try {
    const href = cleaned.startsWith('www.') ? `https://${cleaned}` : cleaned;
    const url = new URL(href);
    const parts = url.pathname.split('/').filter(Boolean).map((part) => {
      try { return decodeURIComponent(part); } catch { return part; }
    });
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const part = parts[i]?.trim() || '';
      if (part.length <= 2) continue;
      if (GENERIC_URL_SEGMENT.has(part.toLowerCase())) continue;
      if (part.length >= 16 && /^[a-z0-9]+$/i.test(part)) continue;
      return humanizeSlug(part);
    }
    return url.hostname.replace(/^www\./, '');
  } catch {
    return cleaned.length > 80 ? `${cleaned.slice(0, 79)}…` : cleaned;
  }
}

/** Board/detail heading: sentence case, and a URL is never the whole title. */
export function presentTaskTitle(raw: string): string {
  let text = collapseSpace(raw);
  if (!text) return '';
  text = collapseSpace(text.replace(URL_IN_TEXT, (url) => urlTitleLabel(url)));
  if (!text) return '';
  if (isShouting(text)) text = text.toLowerCase();
  if (!(text.includes('.') && !text.includes(' '))) text = capitalizeFirst(text);
  if (text.length > 140) text = `${text.slice(0, 139).trimEnd()}…`;
  return text;
}

function normCopy(value?: string | null): string {
  return collapseSpace(value || '').toLowerCase();
}

/** English and Indonesian summary lines that are not already the reminder body. */
export function distinctSummary(task: {
  transcript?: string | null;
  summary?: string | null;
  transcript_id?: string | null;
  summary_id?: string | null;
}): { en: string; id: string } {
  const en = (task.summary || '').trim();
  const id = (task.summary_id || '').trim();
  const transcript = normCopy(task.transcript);
  const transcriptId = normCopy(task.transcript_id);
  const showEn = en && normCopy(en) !== transcript ? en : '';
  const showId = id
    && normCopy(id) !== transcriptId
    && normCopy(id) !== transcript
    && normCopy(id) !== normCopy(showEn)
    ? id
    : '';
  return { en: showEn, id: showId };
}

export function priorityLabel(priority: string): string {
  if (priority === 'high') return 'High';
  if (priority === 'medium') return 'Medium';
  if (priority === 'low') return 'Low';
  const trimmed = (priority || '').trim();
  return trimmed ? capitalizeFirst(trimmed) : 'Medium';
}

/** English is the main heading for every role. Staff may see Indonesian as secondary when it differs. */
export function taskTitles(task: TitledTask, role: string): TaskHeading {
  const en = presentTaskTitle(task.title || '');
  const id = presentTaskTitle(task.title_id || '');
  const primary = en || id;
  const secondary = role !== 'boss' && id && id !== primary ? id : '';
  return { primary, secondary };
}
