import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { execute, queryOne } from '@/lib/database';
import { deleteTaskImage, readTaskImage, saveTaskImage } from '@/lib/image-storage';
import { canViewTask } from '@/lib/task-access';

export const dynamic = 'force-dynamic';

type TaskRow = { id: string; assignee_id: string; created_by: string; image_path: string | null };

async function loadTask(id: string): Promise<TaskRow | undefined> {
  return queryOne<TaskRow>(
    'SELECT id, assignee_id, created_by, image_path FROM tasks WHERE id = ?',
    [id],
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = await loadTask(id);
  if (!task || !task.image_path) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewTask(user, task)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const file = readTaskImage(id);
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.buffer.length),
      'Cache-Control': 'private, no-cache',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = await loadTask(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewTask(user, task)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error('[bossnote] image formData failed', err);
    return NextResponse.json(
      { error: 'Could not read the photo. Try a smaller JPEG. The task is already saved.' },
      { status: 400 },
    );
  }

  const image = formData.get('image');
  if (!(image instanceof File) || image.size <= 0) {
    return NextResponse.json({ error: 'Choose a photo to upload.' }, { status: 400 });
  }

  let saved: { publicPath: string };
  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    saved = saveTaskImage(id, buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save the photo.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await execute(
      'UPDATE tasks SET image_path = ?, updated_at = NOW() WHERE id = ?',
      [saved.publicPath, id],
    );
  } catch (err) {
    console.error('[bossnote] image update failed', err);
    deleteTaskImage(id);
    return NextResponse.json(
      { error: 'Could not attach the photo. The task is saved — retry the photo.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, image_path: saved.publicPath });
}
