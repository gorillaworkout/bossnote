import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/database';
import { processVoiceNote, getUserModel, normalizeAudioModel } from '@/lib/ai';
import { resolveAssigneeFromHint } from '@/lib/assignee';
import { readVoice } from '@/lib/voice-storage';

/** Re-runs the AI pipeline on an already-stored voice note. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = await queryOne<{ voice_path: string; assignee_id: string; created_by: string }>(
    'SELECT voice_path, assignee_id, created_by FROM tasks WHERE id = ?',
    [id],
  );
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.id !== task.assignee_id && user.id !== task.created_by) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!task.voice_path) return NextResponse.json({ error: 'No voice note on this task' }, { status: 400 });

  const filename = task.voice_path.split('/').pop()!;
  const mime = `audio/${filename.split('.').pop()}`;

  try {
    const buffer = readVoice(filename);
    const model = normalizeAudioModel(await getUserModel(user.id));
    const ai = await processVoiceNote(buffer.toString('base64'), mime, model);

    const members = await queryAll<{ id: string; name: string }>(
      "SELECT id, name FROM users WHERE role = 'member' ORDER BY name",
    );
    const fromVoice = resolveAssigneeFromHint(ai.assignee_hint, members);
    const assigneeId = fromVoice?.id || task.assignee_id;

    await execute(
      `UPDATE tasks SET title = ?, title_id = ?, description = ?,
         transcript = ?, transcript_id = ?, summary = ?, summary_id = ?,
         steps = ?::jsonb, steps_id = ?::jsonb,
         deliverables = ?::jsonb, deliverables_id = ?::jsonb,
         questions = ?::jsonb, questions_id = ?::jsonb,
         priority = ?, deadline = ?, assignee_id = ?, ai_error = NULL, updated_at = NOW()
       WHERE id = ?`,
      [
        ai.title, ai.title_id, ai.summary,
        ai.transcript, ai.transcript_id, ai.summary, ai.summary_id,
        JSON.stringify(ai.steps), JSON.stringify(ai.steps_id),
        JSON.stringify(ai.deliverables), JSON.stringify(ai.deliverables_id),
        JSON.stringify(ai.questions), JSON.stringify(ai.questions_id),
        ai.priority, ai.deadline, assigneeId, id,
      ],
    );

    const updated = await queryOne(
      `SELECT t.*, bu.name as boss_name, au.name as assignee_name,
         (SELECT COUNT(*) FROM task_replies WHERE task_id = t.id) as reply_count
       FROM tasks t JOIN users bu ON t.created_by = bu.id JOIN users au ON t.assignee_id = au.id
       WHERE t.id = ?`,
      [id],
    );
    return NextResponse.json({ task: updated, ok: true });
  } catch (e) {
    const message = (e as Error).message;
    await execute('UPDATE tasks SET ai_error = ? WHERE id = ?', [message, id]);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
