export const VOICE_UNCLEAR_CODE = 'voice_unclear';
export const VOICE_UNCLEAR_ERROR =
  "Couldn't understand this note. Re-record or type it.";

/** Explicit low-confidence cutoff when the model returns a 0–1 score. */
export const LOW_VOICE_CONFIDENCE = 0.35;

const EXACT_PLACEHOLDERS = new Set([
  'voice note',
  'voice note not transcribed yet',
  'voice note not transcribed',
  'voice note unclear',
  'new task voice note unclear',
  'new task',
  'untitled',
  'untitled task',
  'voice task',
  'unclear',
  'unclear audio',
  'unclear voice note',
]);

export type VoiceClarityInput = {
  title?: string | null;
  title_id?: string | null;
  transcript?: string | null;
  transcript_id?: string | null;
  confidence?: number | null;
};

export type VoiceClarityReason =
  | 'ok'
  | 'ai_failed'
  | 'empty_transcript'
  | 'placeholder'
  | 'low_confidence';

export type VoiceClarity = {
  unclear: boolean;
  confirmable: boolean;
  reason: VoiceClarityReason;
  title: string;
  transcript: string;
};

export type VoiceUnclearPayload = {
  error: string;
  code: typeof VOICE_UNCLEAR_CODE;
  confirmable: boolean;
  transcript: string;
  title: string;
  ai_error: string | null;
};

export function parseConfirmUnclearFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const raw = value.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function isVoiceUnclearError(
  payload: { code?: unknown; error?: unknown } | null | undefined,
): boolean {
  if (!payload) return false;
  if (payload.code === VOICE_UNCLEAR_CODE) return true;
  return typeof payload.error === 'string' && payload.error.includes("Couldn't understand this note");
}

export function normalizeVoiceLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[—–−-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPlaceholderTitle(title: string | null | undefined): boolean {
  const raw = (title ?? '').trim();
  if (!raw) return true;
  const normalized = normalizeVoiceLabel(raw);
  if (!normalized) return true;
  if (EXACT_PLACEHOLDERS.has(normalized)) return true;
  if (normalized.startsWith('voice note')) return true;
  if (/\bnot transcribed\b/.test(normalized)) return true;
  if (/^\[?unclear\b/.test(raw.toLowerCase())) return true;
  return false;
}

export function isUnclearTranscript(transcript: string | null | undefined): boolean {
  const raw = (transcript ?? '').trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();
  if (/^\[unclear[^\]]*\]\.?$/.test(lower)) return true;
  const normalized = normalizeVoiceLabel(raw);
  return normalized === 'unclear' || normalized === 'unclear audio';
}

export function hasUsableTaskText(value: string | null | undefined): boolean {
  const raw = (value ?? '').trim();
  if (!raw) return false;
  if (isPlaceholderTitle(raw) || isUnclearTranscript(raw)) return false;
  return raw.replace(/[^\p{L}]/gu, '').length >= 3;
}

export function firstMeaningfulLine(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() || value.trim();
}

export function assessVoiceClarity(
  ai: VoiceClarityInput | null | undefined,
  aiError?: string | null,
): VoiceClarity {
  if (aiError || !ai) {
    return { unclear: true, confirmable: false, reason: 'ai_failed', title: '', transcript: '' };
  }

  const title = (ai.title || ai.title_id || '').trim();
  const transcript = (ai.transcript || ai.transcript_id || '').trim();
  const titleBad = isPlaceholderTitle(title);
  const transcriptBad = isUnclearTranscript(transcript);
  const confidence =
    typeof ai.confidence === 'number' && Number.isFinite(ai.confidence) ? ai.confidence : null;
  const confidenceBad = confidence !== null && confidence < LOW_VOICE_CONFIDENCE;

  if (!titleBad && !transcriptBad && !confidenceBad) {
    return { unclear: false, confirmable: false, reason: 'ok', title, transcript };
  }

  const confirmable =
    hasUsableTaskText(transcript) || (!titleBad && hasUsableTaskText(title));

  let reason: VoiceClarityReason = 'placeholder';
  if (transcriptBad && !hasUsableTaskText(transcript)) reason = 'empty_transcript';
  if (titleBad && transcriptBad) reason = transcript ? 'placeholder' : 'empty_transcript';
  if (confidenceBad && !titleBad && !transcriptBad) reason = 'low_confidence';

  return { unclear: true, confirmable, reason, title, transcript };
}

export function shouldInsertVoiceTask(clarity: VoiceClarity, confirmUnclear: boolean): boolean {
  if (!clarity.unclear) return true;
  return Boolean(confirmUnclear && clarity.confirmable);
}

export function voiceUnclearPayload(
  clarity: VoiceClarity,
  aiError: string | null = null,
): VoiceUnclearPayload {
  return {
    error: VOICE_UNCLEAR_ERROR,
    code: VOICE_UNCLEAR_CODE,
    confirmable: clarity.confirmable,
    transcript: clarity.transcript,
    title: clarity.title,
    ai_error: aiError,
  };
}

/** When the user keeps a weak draft, prefer a real transcript line over a placeholder title. */
export function resolveVoiceCreateTitles(
  ai: VoiceClarityInput | null | undefined,
  confirmed: boolean,
): { title: string; titleId: string } {
  const title = (ai?.title || '').trim();
  const titleId = (ai?.title_id || '').trim();
  const transcript = (ai?.transcript || '').trim();
  const transcriptId = (ai?.transcript_id || '').trim();

  if (confirmed && isPlaceholderTitle(title) && hasUsableTaskText(transcript)) {
    const fromEn = firstMeaningfulLine(transcript).slice(0, 120);
    const fromId = firstMeaningfulLine(transcriptId || transcript).slice(0, 120);
    return { title: fromEn, titleId: fromId };
  }

  return {
    title: title || titleId,
    titleId: titleId || title,
  };
}
