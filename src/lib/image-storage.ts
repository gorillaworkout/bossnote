import fs from 'fs';
import path from 'path';
import {
  TASK_IMAGE_MAX_COUNT,
  TASK_IMAGE_MAX_INDEX,
  imageIndexFromFilename,
  isTaskImageFilename,
  nextImageIndex,
  taskImageContentType,
  taskImagePublicPath,
  validateTaskImageBuffer,
} from './task-image.ts';

// Same idea as voice notes: keep uploads outside the repo so rsync --delete cannot wipe them.
const IMAGE_DIR = process.env.IMAGE_UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads', 'images');

const EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'] as const;

function imageDir(): string {
  return process.env.IMAGE_UPLOAD_DIR || IMAGE_DIR;
}

function assertTaskId(taskId: string): void {
  if (!/^[a-f0-9-]{36}$/i.test(taskId)) throw new Error('Invalid task');
}

function listFilenames(): string[] {
  try {
    return fs.readdirSync(/*turbopackIgnore: true*/ imageDir());
  } catch {
    return [];
  }
}

function unlinkQuiet(filePath: string): void {
  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) fs.unlinkSync(/*turbopackIgnore: true*/ filePath);
  } catch (err) {
    console.error('[bossnote] failed to remove image', filePath, err);
  }
}

/** Removes every screenshot file for a task (legacy `{id}.ext` and `{id}-{n}.ext`). */
export function deleteTaskImage(taskId: string): void {
  if (!/^[a-f0-9-]{36}$/i.test(taskId)) return;
  const dir = imageDir();
  for (const name of listFilenames()) {
    if (!isTaskImageFilename(taskId, name)) continue;
    unlinkQuiet(path.join(/*turbopackIgnore: true*/ dir, name));
  }
}

/** Removes one gallery slot, including a legacy unindexed file when index is 0. */
export function deleteTaskImageSlot(taskId: string, index: number): void {
  if (!/^[a-f0-9-]{36}$/i.test(taskId)) return;
  if (!Number.isInteger(index) || index < 0 || index > TASK_IMAGE_MAX_INDEX) return;
  const dir = imageDir();
  for (const name of listFilenames()) {
    if (imageIndexFromFilename(taskId, name) !== index) continue;
    unlinkQuiet(path.join(/*turbopackIgnore: true*/ dir, name));
  }
}

export function readTaskImageAt(taskId: string, index: number): { buffer: Buffer; ext: string; contentType: string } | null {
  if (!/^[a-f0-9-]{36}$/i.test(taskId)) return null;
  if (!Number.isInteger(index) || index < 0 || index > TASK_IMAGE_MAX_INDEX) return null;
  const dir = imageDir();
  const names: string[] = [];
  for (const ext of EXTS) {
    if (index === 0) names.push(`${taskId}-0.${ext}`, `${taskId}.${ext}`);
    else names.push(`${taskId}-${index}.${ext}`);
  }
  for (const name of names) {
    const filePath = path.join(/*turbopackIgnore: true*/ dir, name);
    if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) continue;
    const ext = name.split('.').pop() || '';
    return {
      buffer: fs.readFileSync(/*turbopackIgnore: true*/ filePath),
      ext,
      contentType: taskImageContentType(ext),
    };
  }
  return null;
}

export function readTaskImage(taskId: string): { buffer: Buffer; ext: string; contentType: string } | null {
  return readTaskImageAt(taskId, 0);
}

/** Writes one slot without touching the other photos on the task. */
export function saveTaskImage(taskId: string, buffer: Buffer, index = 0): { filename: string; publicPath: string; index: number } {
  assertTaskId(taskId);
  if (!Number.isInteger(index) || index < 0 || index > TASK_IMAGE_MAX_INDEX) throw new Error('Invalid image');
  const ext = validateTaskImageBuffer(buffer);
  fs.mkdirSync(/*turbopackIgnore: true*/ imageDir(), { recursive: true });
  deleteTaskImageSlot(taskId, index);
  const filename = index === 0 ? `${taskId}-0.${ext}` : `${taskId}-${index}.${ext}`;
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ imageDir(), filename), buffer);
  return { filename, publicPath: taskImagePublicPath(taskId, index), index };
}

/** Appends a screenshot. A full gallery throws; existing files stay put. */
export function appendTaskImage(
  taskId: string,
  buffer: Buffer,
  existingPaths: string[],
): { filename: string; publicPath: string; index: number } {
  assertTaskId(taskId);
  if (existingPaths.length >= TASK_IMAGE_MAX_COUNT) {
    throw new Error(`You can attach up to ${TASK_IMAGE_MAX_COUNT} screenshots.`);
  }
  const index = nextImageIndex(taskId, existingPaths, listFilenames());
  if (index > TASK_IMAGE_MAX_INDEX) {
    throw new Error(`You can attach up to ${TASK_IMAGE_MAX_COUNT} screenshots.`);
  }
  return saveTaskImage(taskId, buffer, index);
}
