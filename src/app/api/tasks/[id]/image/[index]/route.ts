import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { deleteTaskImageSlot, readTaskImageAt } from '@/lib/image-storage';
import { canViewTask } from '@/lib/task-access';
import { loadTaskForImage, saveTaskGallery } from '@/lib/task-gallery';
import { imageFileResponse } from '@/lib/task-image-response';
import { TASK_IMAGE_MAX_INDEX, imageIndexFromPublicPath, taskImagePaths } from '@/lib/task-image';

export const dynamic = 'force-dynamic';

function parseIndex(raw: string): number | null {
  if (!/^\d{1,2}$/.test(raw)) return null;
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 0 || index > TASK_IMAGE_MAX_INDEX) return null;
  return index;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, index: indexRaw } = await params;
  const index = parseIndex(indexRaw);
  if (index === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const task = await loadTaskForImage(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewTask(user, task)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const allowed = taskImagePaths(task).some((publicPath) => imageIndexFromPublicPath(id, publicPath) === index);
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const file = readTaskImageAt(id, index);
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return imageFileResponse(file);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, index: indexRaw } = await params;
  const index = parseIndex(indexRaw);
  if (index === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const task = await loadTaskForImage(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewTask(user, task)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const remaining = taskImagePaths(task).filter((publicPath) => imageIndexFromPublicPath(id, publicPath) !== index);
  if (remaining.length === taskImagePaths(task).length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  deleteTaskImageSlot(id, index);
  try {
    await saveTaskGallery(id, remaining);
  } catch (err) {
    console.error('[bossnote] image remove failed', err);
    return NextResponse.json({ error: 'Could not remove that photo.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    image_path: remaining[0] ?? null,
    image_paths: remaining,
  });
}
