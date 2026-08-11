const GW_BASE = process.env.GORILLAWORKOUT_API_BASE || 'https://llm.gorillaworkout.id/v1';
const GW_KEY = process.env.GORILLAWORKOUT_API_KEY || '';

// Gemini is the only audio-capable family on this gateway (Claude has audioInput:false).
export const AUDIO_MODELS = [
  'ag/gemini-3-flash',
  'ag/gemini-3.6-flash-medium',
  'ag/gemini-3.5-flash-high',
  'ag/gemini-3-flash-agent',
] as const;

export const DEFAULT_AUDIO_MODEL = AUDIO_MODELS[0];

export interface VoiceTask {
  transcript: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  deadline: string | null;
  summary: string;
  steps: string[];
  deliverables: string[];
  questions: string[];
}

const SYSTEM = `Kamu asisten yang mengubah voice note Boss jadi task yang JELAS untuk staff.

Langkah:
1. Transkrip audio ke teks Bahasa Indonesia, verbatim.
2. Pahami maksudnya, lalu susun task terstruktur.

Output HANYA JSON valid (tanpa markdown fence):
{
  "transcript": "transkrip verbatim apa yang Boss ucapkan",
  "title": "kalimat perintah singkat & spesifik, maks 80 karakter",
  "priority": "high" | "medium" | "low",
  "deadline": "YYYY-MM-DDTHH:mm:ss+07:00" atau null,
  "summary": "2-3 kalimat: apa yang diminta dan hasil akhir yang diharapkan",
  "steps": ["langkah konkret 1", "langkah konkret 2"],
  "deliverables": ["output nyata yang harus diserahkan"],
  "questions": ["hal yang belum jelas dan perlu dikonfirmasi ke Boss"]
}

Aturan:
- title: pakai kata kerja di depan. Contoh: "Bikin 3 konten IG promo bulan depan". Bukan "Konten IG".
- priority: "high" kalau Boss bilang penting/urgent/segera/ASAP atau deadline < 2 hari. "low" kalau santai/kalau ada waktu. Selain itu "medium".
- deadline: hitung dari tanggal hari ini yang diberikan. "besok sore" = besok 17:00. "minggu depan" = 7 hari lagi 17:00. Kalau tidak disebut, null.
- steps: pecah jadi langkah yang bisa langsung dikerjakan. Kalau Boss cuma minta 1 hal, cukup 1 langkah. Jangan mengarang langkah yang tidak diminta.
- deliverables: barang/hasil konkret (file, post, laporan, angka). Kalau tidak jelas, array kosong.
- questions: hanya kalau memang ada yang ambigu. Kalau semua jelas, array kosong.
- Kalau audio tidak terdengar jelas, transcript = "[audio tidak jelas]" dan title = "Voice note tidak terdengar jelas".`;

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

function parseTask(raw: string, fallbackTranscript = ''): VoiceTask {
  // Strip fences, then take the outermost JSON object.
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  const strArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

  try {
    const p = JSON.parse(slice);
    const transcript = typeof p.transcript === 'string' && p.transcript.trim()
      ? p.transcript.trim()
      : fallbackTranscript;

    return {
      transcript,
      title: (typeof p.title === 'string' && p.title.trim() ? p.title : transcript).slice(0, 120) || 'Voice Task',
      priority: p.priority === 'high' || p.priority === 'low' ? p.priority : 'medium',
      deadline: typeof p.deadline === 'string' && p.deadline.trim() ? p.deadline : null,
      summary: typeof p.summary === 'string' ? p.summary.trim() : '',
      steps: strArray(p.steps),
      deliverables: strArray(p.deliverables),
      questions: strArray(p.questions),
    };
  } catch {
    // Model returned prose instead of JSON — keep it as the transcript rather than losing it.
    const body = cleaned || fallbackTranscript;
    return {
      transcript: body,
      title: body.slice(0, 120) || 'Voice Task',
      priority: 'medium',
      deadline: null,
      summary: '',
      steps: [],
      deliverables: [],
      questions: [],
    };
  }
}

/** Transcribe + structure a voice note in one gateway round-trip. */
export async function processVoiceNote(
  audioBase64: string,
  mimeType: string,
  model: string = DEFAULT_AUDIO_MODEL,
): Promise<VoiceTask> {
  if (!GW_KEY) throw new Error('GORILLAWORKOUT_API_KEY not configured');

  // Gateway expects a bare container name: audio/webm;codecs=opus -> webm
  const format = (mimeType.split(';')[0].split('/')[1] || 'webm').toLowerCase();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

  const raw = await callGateway({
    model,
    stream: false,
    // Generous budget: Gemini spends reasoning tokens before emitting content,
    // and a small cap returns an empty string with finish_reason:max_tokens.
    max_tokens: 4000,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Hari ini ${today} (Asia/Jakarta). Transkrip voice note Boss berikut dan susun jadi task. Jawab JSON saja.` },
          { type: 'input_audio', input_audio: { data: audioBase64, format } },
        ],
      },
    ],
  });

  const task = parseTask(raw);
  if (!task.transcript) throw new Error('Model returned empty transcript');
  return task;
}

/** Transcribe a voice reply — no task structuring needed. */
export async function transcribeReply(
  audioBase64: string,
  mimeType: string,
  model: string = DEFAULT_AUDIO_MODEL,
): Promise<string> {
  if (!GW_KEY) throw new Error('GORILLAWORKOUT_API_KEY not configured');

  const format = (mimeType.split(';')[0].split('/')[1] || 'webm').toLowerCase();

  return callGateway({
    model,
    stream: false,
    max_tokens: 2000,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Transkrip audio ini ke teks Bahasa Indonesia. Output HANYA transkripnya, tanpa kata pembuka.' },
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
  // Guard against a stale non-audio model in the DB (e.g. a Claude id).
  return stored && (AUDIO_MODELS as readonly string[]).includes(stored) ? stored : DEFAULT_AUDIO_MODEL;
}
