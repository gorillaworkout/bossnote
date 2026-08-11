import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryOne, execute } from '@/lib/database';
import { transcribeReply, getUserModel } from '@/lib/ai';
import { saveVoice, voiceExt } from '@/lib/voice-storage';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = await queryOne<{ assignee_id: string; created_by: string }>(
    'SELECT assignee_id, created_by FROM tasks WHERE id = ?',
    [id],
  );
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.id !== task.assignee_id && user.id !== task.created_by) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const voiceFile = formData.get('voice') as File | null;
  if (!voiceFile) return NextResponse.json({ error: 'Voice recording is required' }, { status: 400 });

  const replyId = uuidv4();
  const buffer = Buffer.from(await voiceFile.arrayBuffer());

  let voicePath: string;
  try {
    voicePath = saveVoice(replyId, buffer, voiceExt(voiceFile));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  let transcript = '';
  let aiError: string | null = null;
  try {
    transcript = await transcribeReply(
      buffer.toString('base64'),
      voiceFile.type,
      await getUserModel(user.id),
    );
  } catch (e) {
    aiError = (e as Error).message;
    console.error('[bossnote] Reply transcription failed:', aiError);
  }

  const durationRaw = Number(formData.get('voice_duration'));
  const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : null;

  await execute(
    'INSERT INTO task_replies (id, task_id, user_id, voice_path, voice_duration, transcript) VALUES (?, ?, ?, ?, ?, ?)',
    [replyId, id, user.id, voicePath, duration, transcript],
  );

  const reply = await queryOne(
    'SELECT r.*, u.name as user_name FROM task_replies r JOIN users u ON r.user_id = u.id WHERE r.id = ?',
    [replyId],
  );

  return NextResponse.json({ reply, ai_error: aiError, ok: true }, { status: 201 });
}
