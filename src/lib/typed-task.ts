export type TypedTaskInput = {
  text?: string;
  title?: string;
  priority?: string;
  deadline?: string | null;
};

export type TypedTaskFields = {
  title: string;
  title_id: string;
  summary: string;
  summary_id: string;
  transcript: string;
  transcript_id: string;
  priority: 'high' | 'medium' | 'low';
  deadline: string | null;
};

/** Build bilingual-ish task fields from typed text. No LLM involved. */
export function buildTypedTaskFields(input: TypedTaskInput): TypedTaskFields | null {
  const titleRaw = typeof input.title === 'string' ? input.title.trim() : '';
  const textRaw = typeof input.text === 'string' ? input.text.trim() : '';
  const raw = titleRaw || textRaw;
  if (!raw) return null;

  const title = (titleRaw || firstLine(textRaw)).slice(0, 120);
  const body = textRaw || titleRaw;
  const priority =
    input.priority === 'high' || input.priority === 'low' ? input.priority : 'medium';
  const deadline = normalizeDeadline(input.deadline);

  return {
    title,
    title_id: title,
    summary: body,
    summary_id: body,
    transcript: body,
    transcript_id: body,
    priority,
    deadline,
  };
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() || value;
}

function normalizeDeadline(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}
