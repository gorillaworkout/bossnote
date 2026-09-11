import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/database';
import { processVoiceNote, getUserModel, normalizeAudioModel } from '@/lib/ai';
import {
  ASSIGNEE_REQUIRED_CODE,
  ASSIGNEE_REQUIRED_ERROR,
  resolveCreateAssignee,
} from '@/lib/assignee';
import { buildTypedTaskFields } from '@/lib/typed-task';
import { sendPushToUser } from '@/lib/push';
import { notifyLarkTask } from '@/lib/lark';
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

type CreateInput = {
  voiceFile: File | null;
  formAssigneeId: string;
  typedText: string;
  typedTitle: string;
  typedPriority: string;
  typedDeadline: string;
  modelRaw: string;
  voiceDurationRaw: string;
};

async function readCreateInput(request: NextRequest): Promise<CreateInput> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return {
      voiceFile: null,
      formAssigneeId: String(body.assignee_id ?? '').trim(),
      typedText: String(body.text ?? '').trim(),
      typedTitle: String(body.title ?? '').trim(),
      typedPriority: String(body.priority ?? '').trim(),
      typedDeadline: String(body.deadline ?? '').trim(),
      modelRaw: String(body.model ?? ''),
      voiceDurationRaw: '',
    };
  }

  const formData = await request.formData();
  const voice = formData.get('voice');
  const voiceFile = voice instanceof File && voice.size > 0 ? voice : null;
  return {
    voiceFile,
    formAssigneeId: String(formData.get('assignee_id') ?? '').trim(),
    typedText: String(formData.get('text') ?? '').trim(),
    typedTitle: String(formData.get('title') ?? '').trim(),
    typedPriority: String(formData.get('priority') ?? '').trim(),
    typedDeadline: String(formData.get('deadline') ?? '').trim(),
    modelRaw: String(formData.get('model') ?? ''),
    voiceDurationRaw: String(formData.get('voice_duration') ?? ''),
  };
}

async function loadCreatedTask(taskId: string) {
  return queryOne(
    `SELECT t.*, bu.name as boss_name, au.name as assignee_name, 0 as reply_count
     FROM tasks t JOIN users bu ON t.created_by = bu.id JOIN users au ON t.assignee_id = au.id
     WHERE t.id = ?`,
    [taskId],
  );
}

function notifyAssignee(
  assigneeId: string,
  title: string,
  extra?: { assigneeName?: string; priority?: string | null; creatorName?: string; creatorId?: string },
) {
  void sendPushToUser(assigneeId, {
    title: 'New task',
    body: title,
    url: '/dashboard',
  }).catch((err) => {
    console.error('[bossnote] push after create failed:', err);
  });
  notifyLarkTask({
    title,
    creatorName: extra?.creatorName || 'Unknown',
    creatorId: extra?.creatorId,
    assigneeName: extra?.assigneeName || 'Unknown',
    priority: extra?.priority,
  });
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const input = await readCreateInput(request);
  const team = await queryAll<{ id: string; name: string }>(
    'SELECT id, name FROM users ORDER BY name',
  );

  // Typed path: no voice, no LLM. Works even when Gemini is down.
  if (!input.voiceFile) {
    const fields = buildTypedTaskFields({
      text: input.typedText,
      title: input.typedTitle,
      priority: input.typedPriority,
      deadline: input.typedDeadline,
    });
    if (!fields) {
      return NextResponse.json(
        { error: 'Voice recording or reminder text is required' },
        { status: 400 },
      );
    }

    const formUser = input.formAssigneeId
      ? team.find((u) => u.id === input.formAssigneeId)
      : undefined;
    if (!formUser) {
      return NextResponse.json({ error: 'Assignee is required' }, { status: 400 });
    }

    const taskId = uuidv4();
    await execute(
      `INSERT INTO tasks
         (id, title, title_id, description, transcript, transcript_id,
          summary, summary_id, steps, steps_id, deliverables, deliverables_id,
          questions, questions_id,
          assignee_id, created_by, priority, status, deadline, voice_path, voice_duration, ai_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, ?, 'todo', ?, ?, ?, ?)`,
      [
        taskId,
        fields.title,
        fields.title_id,
        fields.summary,
        fields.transcript,
        fields.transcript_id,
        fields.summary,
        fields.summary_id,
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        formUser.id,
        user.id,
        fields.priority,
        fields.deadline,
        null,
        null,
        null,
      ],
    );

    const task = await loadCreatedTask(taskId);
    notifyAssignee(formUser.id, fields.title || fields.title_id, {
      assigneeName: formUser.name,
      priority: fields.priority,
      creatorName: user.name,
      creatorId: user.id,
    });
    return NextResponse.json({ task, ai_error: null, ok: true }, { status: 201 });
  }

  const model = normalizeAudioModel(input.modelRaw || (await getUserModel(user.id)));
  const taskId = uuidv4();
  const buffer = Buffer.from(await input.voiceFile.arrayBuffer());

  const durationRaw = Number(input.voiceDurationRaw);
  const voiceDuration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : null;

  let ai;
  let aiError: string | null = null;
  try {
    ai = await processVoiceNote(buffer.toString('base64'), input.voiceFile.type, model);
  } catch (e) {
    aiError = (e as Error).message;
    console.error('[bossnote] AI pipeline failed:', aiError);
  }

  const assignee = resolveCreateAssignee(input.formAssigneeId, ai?.assignee_hint, team);

  if (!assignee) {
    return NextResponse.json(
      { error: ASSIGNEE_REQUIRED_ERROR, code: ASSIGNEE_REQUIRED_CODE },
      { status: 400 },
    );
  }
  const assigneeId = assignee.id;

  let voicePath: string;
  try {
    voicePath = saveVoice(taskId, buffer, voiceExt(input.voiceFile));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const title = ai?.title ?? 'Voice note — not transcribed yet';
  const titleId = ai?.title_id ?? 'Voice note — not transcribed yet';

  await execute(
    `INSERT INTO tasks
       (id, title, title_id, description, transcript, transcript_id,
        summary, summary_id, steps, steps_id, deliverables, deliverables_id,
        questions, questions_id,
        assignee_id, created_by, priority, status, deadline, voice_path, voice_duration, ai_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, ?, 'todo', ?, ?, ?, ?)`,
    [
      taskId,
      title,
      titleId,
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

  const task = await loadCreatedTask(taskId);
  const assigneeName = assignee.name;
  notifyAssignee(assigneeId, title || titleId, {
    assigneeName,
    priority: ai?.priority ?? 'medium',
    creatorName: user.name,
    creatorId: user.id,
  });
  return NextResponse.json({ task, ai_error: aiError, ok: true }, { status: 201 });
}
