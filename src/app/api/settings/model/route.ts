import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryOne, execute } from '@/lib/database';
import { AUDIO_MODELS, DEFAULT_AUDIO_MODEL } from '@/lib/ai';

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const row = await queryOne<{ ai_model: string }>(
    'SELECT ai_model FROM user_settings WHERE user_id = ?',
    [user.id],
  );
  return NextResponse.json({ model: row?.ai_model || DEFAULT_AUDIO_MODEL, options: AUDIO_MODELS });
}

export async function PUT(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { model } = await request.json();
  // Only audio-capable models are valid here — a text-only model would fail every transcription.
  if (!(AUDIO_MODELS as readonly string[]).includes(model)) {
    return NextResponse.json(
      { error: 'Model tidak mendukung audio input', options: AUDIO_MODELS },
      { status: 400 },
    );
  }

  await execute(
    `INSERT INTO user_settings (user_id, ai_model) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET ai_model = EXCLUDED.ai_model`,
    [user.id, model],
  );
  return NextResponse.json({ model, ok: true });
}
