const GW_BASE = process.env.GORILLAWORKOUT_API_BASE || 'https://llm.gorillaworkout.id/v1';
const GW_KEY = process.env.GORILLAWORKOUT_API_KEY || '';

export const AUDIO_MODELS = [
  'ag/gemini-3-flash',
  'ag/gemini-3.6-flash-medium',
  'ag/gemini-3.5-flash-high',
  'ag/gemini-3-flash-agent',
] as const;

export const DEFAULT_AUDIO_MODEL = AUDIO_MODELS[0];

export interface VoiceTask {
  transcript: string;         // English (verbatim if spoken in English, translated otherwise)
  transcript_id: string;      // Indonesian translation
  title: string;              // English
  title_id: string;           // Indonesian
  priority: 'high' | 'medium' | 'low';
  deadline: string | null;
  summary: string;            // English
  summary_id: string;         // Indonesian for staff
  steps: string[];            // English
  steps_id: string[];         // Indonesian
  deliverables: string[];     // English
  deliverables_id: string[];  // Indonesian
  questions: string[];        // English
  questions_id: string[];     // Indonesian for staff
}

const SYSTEM = `You have ONE job: turn a voice note into a structured task, in TWO languages —
English and Indonesian.

═══════════════════════════════════
STEP 1 — LISTEN & UNDERSTAND
═══════════════════════════════════
Listen to the audio carefully. The speaker may use ANY language (English,
Mandarin, Indonesian, or a mix). Understand exactly what is being asked.

═══════════════════════════════════
STEP 2 — STRUCTURED OUTPUT (ENGLISH + INDONESIAN)
═══════════════════════════════════
Produce a structured task in TWO languages:
- The primary field = ENGLISH (the boss reads English).
- The _id field = natural INDONESIAN (the staff reads Indonesian).

If the speaker spoke English, the English fields are a clean transcription.
If the speaker spoke Mandarin (or any other language), the English fields are
an accurate English TRANSLATION — never leave them in the original language.

Output STRICTLY valid JSON (no markdown fences, no markdown):

{
  "transcript": "ENGLISH — what was said, in English (verbatim if English, translated otherwise).",
  "transcript_id": "Natural Indonesian translation for staff.",

  "title": "Concise imperative task title in ENGLISH, max 80 chars.",
  "title_id": "Title in Indonesian.",

  "priority": "high" | "medium" | "low",
  "deadline": "YYYY-MM-DDTHH:mm:ss+07:00 or null",

  "summary": "2-3 sentences in ENGLISH: what is asked, expected outcome.",
  "summary_id": "Same summary in Indonesian.",

  "steps": ["Step 1 in English", "Step 2"],
  "steps_id": ["Langkah 1 in Indonesian", "Langkah 2"],

  "deliverables": ["Tangible outputs in English"],
  "deliverables_id": ["Output nyata in Indonesian"],

  "questions": ["Question in English — only if genuinely ambiguous"],
  "questions_id": ["Pertanyaan in Indonesian — hanya jika memang ambigu"]
}

RULES
- The primary fields are ALWAYS English. Never leave them in Mandarin or any
  other language — translate to English.
- Priority: high if speaker says important/urgent/segera/ASAP or deadline < 2 days.
  low if relaxed/when you have time. Otherwise medium.
- Deadline: resolve against today. "tomorrow evening" = tomorrow 17:00.
  "next week" = 7 days at 17:00. If not mentioned, null.
- Steps: directly actionable. Don't invent steps the boss didn't ask for.
- Questions: only genuine ambiguities the boss needs to clarify. Empty if clear.
- Unintelligible audio: transcript = "[unclear audio]", title = "Voice note unclear".
- If the speaker's language IS already Indonesian, the _id fields still need
  natural Indonesian — duplicate the value, don't leave them blank.`;

async function callGateway(body: unknown): Promise<string> {
  const res = await fetch(`${GW_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GW_KEY}`,
      'X-Title': 'BossNote',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gateway ${res.status}: ${text.slice(0, 300)}`);
  }

  // Gateway may answer SSE even when stream:false is requested.
  if (text.startsWith('data:')) {
    let merged = '';
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        merged += JSON.parse(payload).choices?.[0]?.delta?.content ?? '';
      } catch {
        /* skip malformed chunk */
      }
    }
    return merged.trim();
  }

  return (JSON.parse(text).choices?.[0]?.message?.content ?? '').trim();
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : [];
}

function parseTask(raw: string, fallbackTranscript = ''): VoiceTask {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  try {
    const p = JSON.parse(slice);

    const transcript = str(p.transcript);
    const transcript_id = str(p.transcript_id);

    const title = str(p.title) || transcript || 'Voice Task';
    const title_id = str(p.title_id) || title;

    const steps = strArray(p.steps);
    const steps_id = strArray(p.steps_id).length > 0 ? strArray(p.steps_id) : steps;

    const deliverables = strArray(p.deliverables);
    const deliverables_id = strArray(p.deliverables_id).length > 0
      ? strArray(p.deliverables_id) : deliverables;

    const questions = strArray(p.questions);
    const questions_id = strArray(p.questions_id).length > 0
      ? strArray(p.questions_id) : questions;

    return {
      transcript: transcript || fallbackTranscript,
      transcript_id: transcript_id || transcript || fallbackTranscript,
      title: title.slice(0, 120) || 'Voice Task',
      title_id: title_id.slice(0, 120) || 'Voice Task',
      priority: p.priority === 'high' || p.priority === 'low' ? p.priority : 'medium',
      deadline: typeof p.deadline === 'string' && p.deadline.trim() ? p.deadline : null,
      summary: str(p.summary),
      summary_id: str(p.summary_id) || str(p.summary),
      steps,
      steps_id,
      deliverables,
      deliverables_id,
      questions,
      questions_id,
    };
  } catch {
    const body = cleaned || fallbackTranscript;
    return {
      transcript: body, transcript_id: body,
      title: body.slice(0, 120) || 'Voice Task', title_id: body.slice(0, 120) || 'Voice Task',
      priority: 'medium', deadline: null,
      summary: '', summary_id: '',
      steps: [], steps_id: [],
      deliverables: [], deliverables_id: [],
      questions: [], questions_id: [],
    };
  }
}

/** Transcribe + structure in one gateway round-trip. */
export async function processVoiceNote(
  audioBase64: string,
  mimeType: string,
  model: string = DEFAULT_AUDIO_MODEL,
): Promise<VoiceTask> {
  if (!GW_KEY) throw new Error('GORILLAWORKOUT_API_KEY not configured');

  const format = (mimeType.split(';')[0].split('/')[1] || 'webm').toLowerCase();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

  const raw = await callGateway({
    model,
    stream: false,
    max_tokens: 6000,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Today is ${today} (Asia/Jakarta). Transcribe the voice note and produce a bilingual (original language + Indonesian) structured task. JSON only.`,
          },
          { type: 'input_audio', input_audio: { data: audioBase64, format } },
        ],
      },
    ],
  });

  const task = parseTask(raw);
  if (!task.transcript) throw new Error('Model returned empty transcript');
  return task;
}

/** Transcribe a voice reply. Optional context helps the model disambiguate
 *  proper nouns (e.g. "Ritz Carlton" vs "ITC Roxy Mas"). */
export async function transcribeReply(
  audioBase64: string,
  mimeType: string,
  model: string = DEFAULT_AUDIO_MODEL,
  context?: string,
): Promise<string> {
  if (!GW_KEY) throw new Error('GORILLAWORKOUT_API_KEY not configured');

  const format = (mimeType.split(';')[0].split('/')[1] || 'webm').toLowerCase();

  const contextNote = context
    ? `\nContext: the original task was about "${context}". Use this to correctly transcribe names and places.`
    : '';

  return callGateway({
    model,
    stream: false,
    max_tokens: 2000,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Transcribe this audio VERBATIM — word for word, in WHATEVER language the speaker used. Do NOT translate. Do NOT paraphrase. Do NOT correct what was said. If a word is genuinely unclear, write [unclear] — but do NOT guess or substitute. Output ONLY the transcription.${contextNote}`,
          },
          { type: 'input_audio', input_audio: { data: audioBase64, format } },
        ],
      },
    ],
  });
}

export async function getUserModel(userId: string): Promise<string> {
  const { queryOne } = await import('@/lib/database');
  const row = await queryOne<{ ai_model: string }>(
    'SELECT ai_model FROM user_settings WHERE user_id = ?',
    [userId],
  );
  const stored = row?.ai_model;
  return stored && (AUDIO_MODELS as readonly string[]).includes(stored)
    ? stored
    : DEFAULT_AUDIO_MODEL;
}
