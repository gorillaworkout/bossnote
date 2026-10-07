import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { appendTaskImage, deleteTaskImageSlot, readTaskImageAt } from '@/lib/image-storage';
import { canViewTask } from '@/lib/task-access';
import { loadTaskForImage, saveTaskGallery, type TaskImageRow } from '@/lib/task-gallery';
import { publishTaskListChange } from '@/lib/task-live';
import { imageFileResponse } from '@/lib/task-image-response';
import {
  TASK_IMAGE_MAX_COUNT,
  imageIndexFromPublicPath,
  taskImagePaths,
} from '@/lib/task-image';

export const dynamic = 'force-dynamic';

function imageParties(task: TaskImageRow) {
  return {
    assignee_id: task.assignee_id,
    created_by: task.created_by,
    creator_role: task.creator_role,
    creator_department_id: task.creator_department_id,
    assignee_role: task.assignee_role,
    assignee_department_id: task.assignee_department_id,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = await loadTaskForImage(id);
  const paths = task ? taskImagePaths(task) : [];
  if (!task || paths.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewTask(user, imageParties(task))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const index = imageIndexFromPublicPath(id, paths[0]) ?? 0;
  const file = readTaskImageAt(id, index);
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return imageFileResponse(file);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = await loadTaskForImage(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewTask(user, imageParties(task))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

  const images = formData.getAll('image').filter((item): item is File => item instanceof File && item.size > 0);
  if (images.length === 0) {
    return NextResponse.json({ error: 'Choose a photo to upload.' }, { status: 400 });
  }

  const savedPaths = taskImagePaths(task);
  const added: { index: number }[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const image of images) {
    if (savedPaths.length >= TASK_IMAGE_MAX_COUNT) {
      failed.push({
        name: image.name || 'screenshot',
        error: `You can attach up to ${TASK_IMAGE_MAX_COUNT} screenshots.`,
      });
      continue;
    }
    try {
      const buffer = Buffer.from(await image.arrayBuffer());
      const stored = appendTaskImage(id, buffer, savedPaths);
      savedPaths.push(stored.publicPath);
      added.push({ index: stored.index });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the photo.';
      failed.push({ name: image.name || 'screenshot', error: message });
    }
  }

  if (added.length === 0) {
    return NextResponse.json(
      { error: failed[0]?.error || 'Could not save the photo.', failed },
      { status: 400 },
    );
  }

  try {
    await saveTaskGallery(id, savedPaths);
  } catch (err) {
    console.error('[bossnote] image update failed', err);
    for (const item of added) deleteTaskImageSlot(id, item.index);
    const migration = err instanceof Error && err.message.includes('010_task_images');
    return NextResponse.json(
      {
        error: migration
          ? err.message
          : 'Could not attach the photo. The task is saved — retry the photo.',
      },
      { status: 500 },
    );
  }

  publishTaskListChange();
  return NextResponse.json({
    ok: true,
    image_path: savedPaths[0],
    image_paths: savedPaths,
    failed,
  });
}
