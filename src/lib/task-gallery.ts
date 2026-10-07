import { execute, queryOne } from './database.ts';
import { canViewTask, type TaskParties, type Viewer } from './task-access.ts';

export type TaskImageRow = {
  id: string;
  assignee_id: string;
  created_by: string;
  creator_role: string;
  creator_department_id: string | null;
  assignee_role: string;
  assignee_department_id: string | null;
  image_path: string | null;
  image_paths?: unknown;
};

const PARTY_COLUMNS = `bu.role AS creator_role, bu.department_id AS creator_department_id, au.role AS assignee_role, au.department_id AS assignee_department_id`;
const PARTY_JOINS = `JOIN users bu ON t.created_by = bu.id JOIN users au ON t.assignee_id = au.id`;

export function canViewTaskImage(viewer: Viewer, task: TaskImageRow): boolean {
  const parties: TaskParties = {
    assignee_id: task.assignee_id,
    created_by: task.created_by,
    creator_role: task.creator_role,
    creator_department_id: task.creator_department_id,
    assignee_role: task.assignee_role,
    assignee_department_id: task.assignee_department_id,
  };
  return canViewTask(viewer, parties);
}

function missingColumn(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '42703');
}

/** Reads the gallery. Still works before migrations/010_task_images.sql is applied. */
export async function loadTaskForImage(id: string): Promise<TaskImageRow | undefined> {
  try {
    return await queryOne<TaskImageRow>(
      `SELECT t.id, t.assignee_id, t.created_by, t.image_path, t.image_paths, ${PARTY_COLUMNS}
       FROM tasks t ${PARTY_JOINS} WHERE t.id = ?`,
      [id],
    );
  } catch (err) {
    if (!missingColumn(err)) throw err;
    return queryOne<TaskImageRow>(
      `SELECT t.id, t.assignee_id, t.created_by, t.image_path, ${PARTY_COLUMNS}
       FROM tasks t ${PARTY_JOINS} WHERE t.id = ?`,
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
