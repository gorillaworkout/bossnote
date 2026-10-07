import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryOne, execute } from '@/lib/database';
import { transcribeReply, getUserModel } from '@/lib/ai';
import { saveVoice, voiceExt } from '@/lib/voice-storage';
import { publishTaskListChange } from '@/lib/task-live';
import { canViewTask, type TaskParties } from '@/lib/task-access';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = await queryOne<TaskParties>(
    `SELECT t.assignee_id, t.created_by,
       bu.role AS creator_role, bu.department_id AS creator_department_id,
       au.role AS assignee_role, au.department_id AS assignee_department_id
     FROM tasks t
     JOIN users bu ON t.created_by = bu.id
     JOIN users au ON t.assignee_id = au.id
     WHERE t.id = ?`,
    [id],
  );
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewTask(user, task)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const voiceFile = formData.get('voice') as File | null;
  const questionIdxRaw = formData.get('question_index') as string | null;
  const questionIndex = questionIdxRaw != null ? Number(questionIdxRaw) : null;
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
    // Fetch task transcript to give the AI context — prevents hallucination
    // of proper nouns (e.g. "Ritz Carlton" → "ITC Roxy Mas").
    const taskCtx = await queryOne<{ transcript: string }>(
      'SELECT transcript FROM tasks WHERE id = ?',
      [id],
    );
    const context = taskCtx?.transcript?.slice(0, 200) || undefined;

    transcript = await transcribeReply(
      buffer.toString('base64'),
      voiceFile.type,
      await getUserModel(user.id),
      context,
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

  // Boss answered a specific pending question → mark it.
  if (questionIndex != null && questionIndex >= 0 && user.role === 'boss') {
    const t = await queryOne<{ questions: string[]; answered_questions: number[] }>(
      'SELECT questions, answered_questions FROM tasks WHERE id = ?',
      [id],
    );
    const rawQuestions: unknown = t?.questions;
    const qs: string[] = Array.isArray(rawQuestions)
      ? rawQuestions.filter((item): item is string => typeof item === 'string')
      : [];
    const rawAnswers: unknown = t?.answered_questions;
    const ans: number[] = Array.isArray(rawAnswers)
      ? rawAnswers.filter((item): item is number => typeof item === 'number')
      : [];

    if (questionIndex < qs.length && !ans.includes(questionIndex)) {
      ans.push(questionIndex);
      await execute(
        'UPDATE tasks SET answered_questions = ?::jsonb WHERE id = ?',
        [JSON.stringify(ans), id],
      );
    }
  }

  const reply = await queryOne(
    'SELECT r.*, u.name as user_name FROM task_replies r JOIN users u ON r.user_id = u.id WHERE r.id = ?',
    [replyId],
  );

  publishTaskListChange();
  return NextResponse.json({ reply, ai_error: aiError, ok: true }, { status: 201 });
}
