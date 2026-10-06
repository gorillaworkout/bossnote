import { execute, queryOne } from './database.ts';

export type TaskImageRow = {
  id: string;
  assignee_id: string;
  created_by: string;
  image_path: string | null;
  image_paths?: unknown;
};

function missingColumn(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '42703');
}

/** Reads the gallery. Still works before migrations/010_task_images.sql is applied. */
export async function loadTaskForImage(id: string): Promise<TaskImageRow | undefined> {
  try {
    return await queryOne<TaskImageRow>(
      'SELECT id, assignee_id, created_by, image_path, image_paths FROM tasks WHERE id = ?',
      [id],
    );
  } catch (err) {
    if (!missingColumn(err)) throw err;
    return queryOne<TaskImageRow>(
      'SELECT id, assignee_id, created_by, image_path FROM tasks WHERE id = ?',
      [id],
    );
  }
}

export async function saveTaskGallery(id: string, paths: string[]): Promise<void> {
  try {
    await execute(
      'UPDATE tasks SET image_path = ?, image_paths = ?::jsonb, updated_at = NOW() WHERE id = ?',
      [paths[0] ?? null, JSON.stringify(paths), id],
    );
  } catch (err) {
    if (!missingColumn(err)) throw err;
    if (paths.length > 1) {
      throw new Error('Apply migrations/010_task_images.sql before attaching more than one screenshot.');
    }
    await execute(
      'UPDATE tasks SET image_path = ?, updated_at = NOW() WHERE id = ?',
      [paths[0] ?? null, id],
    );
  }
}
