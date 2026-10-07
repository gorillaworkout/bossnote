import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/database';
import { processVoiceNote, getUserModel, normalizeAudioModel } from '@/lib/ai';
import { ASSIGNEE_REQUIRED_CODE } from '@/lib/assignee';
import {
  candidateListQuery,
  decideCreateAssignee,
  NO_ASSIGNEE_AVAILABLE_CODE,
  noAssigneeAvailableMessage,
  type Party,
} from '@/lib/assignment';
import { buildTypedTaskFields } from '@/lib/typed-task';
import {
  assessVoiceClarity,
  parseConfirmUnclearFlag,
  resolveVoiceCreateTitles,
  shouldInsertVoiceTask,
  voiceUnclearPayload,
} from '@/lib/voice-clarity';
import { sendPushToUser } from '@/lib/push';
import { notifyLarkTask } from '@/lib/lark';
import { assignmentPushUrl } from '@/lib/task-access';
import { buildTaskListQuery } from '@/lib/task-list-scope';
import { dedupeTasksById } from '@/lib/task-board';
import {
  beginCreateClaim,
  completeCreateClaim,
  releaseCreateClaim,
} from '@/lib/create-idempotency';
import { saveVoice, voiceExt } from '@/lib/voice-storage';
import { publishTaskListChange } from '@/lib/task-live';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const { sql, values } = buildTaskListQuery({
    user,
    scope: searchParams.get('scope'),
    assignee: searchParams.get('assignee'),
    status: searchParams.get('status'),
    search: searchParams.get('search'),
  });

  const tasks = dedupeTasksById(await queryAll<{ id: string }>(sql, values));
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
  confirmUnclear: boolean;
  clientToken: string;
};

function readClientToken(value: unknown): string {
  const token = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_-]{8,80}$/.test(token) ? token : '';
}

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
      confirmUnclear: parseConfirmUnclearFlag(body.confirm_unclear),
      clientToken: readClientToken(body.client_token),
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
    confirmUnclear: parseConfirmUnclearFlag(formData.get('confirm_unclear')),
    clientToken: readClientToken(formData.get('client_token')),
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
  taskId: string,
  extra?: {
    assigneeName?: string;
    assigneeOpenId?: string | null;
    assigneeEmail?: string | null;
    priority?: string | null;
    creatorName?: string;
    creatorId?: string;
  },
) {
  void sendPushToUser(assigneeId, {
    title: 'New task',
    body: title,
    url: assignmentPushUrl(taskId),
  }).catch((err) => {
    console.error('[bossnote] push after create failed:', err);
  });
  notifyLarkTask({
    title,
    creatorName: extra?.creatorName || 'Unknown',
    creatorId: extra?.creatorId,
    assigneeName: extra?.assigneeName || 'Unknown',
    assigneeId,
    assigneeOpenId: extra?.assigneeOpenId,
    assigneeEmail: extra?.assigneeEmail,
    priority: extra?.priority,
    taskId,
  });
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const input = await readCreateInput(request);
  const claim = beginCreateClaim(user.id, input.clientToken);
  if (claim.status === 'replay') {
    const existing = await loadCreatedTask(claim.taskId);
    if (existing) return NextResponse.json({ task: existing, ai_error: null, ok: true });
    releaseCreateClaim(user.id, input.clientToken);
  } else if (claim.status === 'in_flight') {
    return NextResponse.json({ error: 'This task is already being created' }, { status: 409 });
  }

  let committed = false;
  const releaseClaim = () => {
    if (!committed) releaseCreateClaim(user.id, input.clientToken);
  };
  const commitClaim = (taskId: string) => {
    committed = true;
    completeCreateClaim(user.id, input.clientToken, taskId);
  };

  try {
    return await createTaskForUser(
      { id: user.id, name: user.name, role: user.role, department_id: user.department_id },
      input,
      commitClaim,
    );
  } finally {
    releaseClaim();
  }
}

async function knownAssigneeIds(formAssigneeId: string): Promise<string[]> {
  if (!formAssigneeId) return [];
  const rows = await queryAll<{ id: string }>('SELECT id FROM users WHERE id = ?', [formAssigneeId]);
  return rows.map((row) => row.id);
}

async function createTaskForUser(
  user: { id: string; name: string; role: string; department_id: string | null },
  input: CreateInput,
  commitClaim: (taskId: string) => void,
) {
  if (user.role === 'member' && !user.department_id) {
    return NextResponse.json(
      {
        error: noAssigneeAvailableMessage(user.role, null),
        code: NO_ASSIGNEE_AVAILABLE_CODE,
      },
      { status: 400 },
    );
  }

  const listed = candidateListQuery({ role: user.role, department_id: user.department_id ?? null });
  const rows = listed
    ? await queryAll<Omit<Party, 'department_id'>>(listed.sql, listed.values)
    : [];
  const candidates: Party[] = rows.map((row) => ({
    ...row,
    department_id: user.department_id,
  }));

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

    const typedDecision = decideCreateAssignee({
      creatorRole: user.role,
      creatorDepartmentId: user.department_id,
      candidates,
      knownUserIds: await knownAssigneeIds(input.formAssigneeId),
      formAssigneeId: input.formAssigneeId,
      hint: null,
      typed: true,
    });
    if (!typedDecision.ok) {
      return NextResponse.json(
        { error: typedDecision.error, code: typedDecision.code },
        { status: typedDecision.status },
      );
    }
    const formUser = typedDecision.user;

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
    publishTaskListChange();
    commitClaim(taskId);
    notifyAssignee(formUser.id, fields.title || fields.title_id, taskId, {
      assigneeName: formUser.name,
      assigneeOpenId: formUser.lark_open_id,
      assigneeEmail: formUser.email,
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

  const clarity = assessVoiceClarity(ai, aiError);
  if (!shouldInsertVoiceTask(clarity, input.confirmUnclear)) {
    return NextResponse.json(voiceUnclearPayload(clarity, aiError), { status: 400 });
  }

  const { title, titleId } = resolveVoiceCreateTitles(ai, input.confirmUnclear && clarity.unclear);
  if (!title) {
    return NextResponse.json(voiceUnclearPayload(clarity, aiError), { status: 400 });
  }

  const decision = decideCreateAssignee({
    creatorRole: user.role,
    creatorDepartmentId: user.department_id,
    candidates,
    knownUserIds: await knownAssigneeIds(input.formAssigneeId),
    formAssigneeId: input.formAssigneeId,
    hint: ai?.assignee_hint ?? null,
    typed: false,
  });
  if (!decision.ok) {
    return NextResponse.json(
      {
        error: decision.error,
        code: decision.code === ASSIGNEE_REQUIRED_CODE ? ASSIGNEE_REQUIRED_CODE : decision.code,
      },
      { status: decision.status },
    );
  }
  const assignee = decision.user;
  const assigneeId = assignee.id;

  let voicePath: string;
  try {
    voicePath = saveVoice(taskId, buffer, voiceExt(input.voiceFile));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
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
      null,
    ],
  );

  const task = await loadCreatedTask(taskId);
  const assigneeName = assignee.name;
  publishTaskListChange();
  commitClaim(taskId);
  notifyAssignee(assigneeId, title || titleId, taskId, {
    assigneeName,
    assigneeOpenId: assignee.lark_open_id,
    assigneeEmail: assignee.email,
    priority: ai?.priority ?? 'medium',
    creatorName: user.name,
    creatorId: user.id,
  });
  return NextResponse.json({ task, ai_error: null, ok: true }, { status: 201 });
}

