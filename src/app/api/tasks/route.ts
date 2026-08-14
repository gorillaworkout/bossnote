import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/database';
import { processVoiceNote, getUserModel } from '@/lib/ai';
import { saveVoice, voiceExt } from '@/lib/voice-storage';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const filterAssignee = searchParams.get('assignee');
  const filterStatus = searchParams.get('status');

  const filterSearch = searchParams.get('search');

  let sql = `
    SELECT t.*,
      bu.name as boss_name,
      au.name as assignee_name,
      (SELECT COUNT(*) FROM task_replies WHERE task_id = t.id) as reply_count
    FROM tasks t
    JOIN users bu ON t.created_by = bu.id
    JOIN users au ON t.assignee_id = au.id
  `;
  const conditions: string[] = [];
  const values: string[] = [];

  if (user.role === 'member') {
    conditions.push('t.assignee_id = ?');
    values.push(user.id);
  }

  if (filterAssignee && user.role === 'boss') {
    conditions.push('t.assignee_id = ?');
    values.push(filterAssignee);
  }

  if (filterStatus) {
    conditions.push('t.status = ?');
    values.push(filterStatus);
  }

  if (filterSearch) {
    conditions.push('(LOWER(t.title) LIKE ? OR LOWER(t.title_id) LIKE ?)');
    const s = `%${filterSearch.toLowerCase()}%`;
    values.push(s, s);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY t.created_at DESC LIMIT 100';

  const tasks = await queryAll(sql, values);
  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'boss') return NextResponse.json({ error: 'Only boss can create tasks' }, { status: 403 });

  const formData = await request.formData();
  const voiceFile = formData.get('voice') as File | null;
  const assigneeId = formData.get('assignee_id') as string;

  if (!voiceFile) return NextResponse.json({ error: 'Voice recording is required' }, { status: 400 });
  if (!assigneeId) return NextResponse.json({ error: 'Assignee is required' }, { status: 400 });

  const assignee = await queryOne('SELECT id FROM users WHERE id = ?', [assigneeId]);
  if (!assignee) return NextResponse.json({ error: 'Assignee not found' }, { status: 400 });

  const model = (formData.get('model') as string) || (await getUserModel(user.id));
  const taskId = uuidv4();
  const buffer = Buffer.from(await voiceFile.arrayBuffer());

  let voicePath: string;
  try {
    voicePath = saveVoice(taskId, buffer, voiceExt(voiceFile));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const durationRaw = Number(formData.get('voice_duration'));
  const voiceDuration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : null;

  // Transcribe + structure in one call. On failure the voice note is still saved,
  // but ai_error is recorded so the UI can show why and offer a retry.
  let ai;
  let aiError: string | null = null;
  try {
    ai = await processVoiceNote(buffer.toString('base64'), voiceFile.type, model);
  } catch (e) {
    aiError = (e as Error).message;
    console.error('[bossnote] AI pipeline failed:', aiError);
  }

  await execute(
    `INSERT INTO tasks
       (id, title, title_id, description, transcript, transcript_id,
        summary, summary_id, steps, steps_id, deliverables, deliverables_id,
        questions, questions_id,
        assignee_id, created_by, priority, status, deadline, voice_path, voice_duration, ai_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, ?, 'todo', ?, ?, ?, ?)`,
    [
      taskId,
      ai?.title ?? 'Voice note — not transcribed yet',
      ai?.title_id ?? 'Voice note — belum ditranskrip',
      ai?.summary ?? '',
      ai?.transcript ?? '',
      ai?.transcript_id ?? '',
      ai?.summary ?? '',
      ai?.summary_id ?? '',
      JSON.stringify(ai?.steps ?? []),
      JSON.stringify(ai?.steps_id ?? []),
      JSON.stringify(ai?.deliverables ?? []),
      JSON.stringify(ai?.deliverables_id ?? []),
      JSON.stringify(ai?.questions ?? []),
      JSON.stringify(ai?.questions_id ?? []),
      assigneeId,
      user.id,
      ai?.priority ?? 'medium',
      ai?.deadline ?? null,
      voicePath,
      voiceDuration,
      aiError,
    ],
  );

  const task = await queryOne(
    `SELECT t.*, bu.name as boss_name, au.name as assignee_name, 0 as reply_count
     FROM tasks t JOIN users bu ON t.created_by = bu.id JOIN users au ON t.assignee_id = au.id
     WHERE t.id = ?`,
    [taskId],
  );

  return NextResponse.json({ task, ai_error: aiError, ok: true }, { status: 201 });
}
