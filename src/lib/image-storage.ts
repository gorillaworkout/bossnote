import fs from 'fs';
import path from 'path';
import { taskImageContentType, validateTaskImageBuffer } from './task-image.ts';

// Same idea as voice notes: keep uploads outside the repo so rsync --delete cannot wipe them.
const IMAGE_DIR = process.env.IMAGE_UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads', 'images');

const EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'] as const;

function imageDir(): string {
  return process.env.IMAGE_UPLOAD_DIR || IMAGE_DIR;
}

export function taskImagePublicPath(taskId: string): string {
  return `/api/tasks/${taskId}/image`;
}

/** Validates and persists one screenshot per task. Replaces any previous file. */
export function saveTaskImage(taskId: string, buffer: Buffer): { filename: string; publicPath: string } {
  if (!/^[a-f0-9-]{36}$/i.test(taskId)) throw new Error('Invalid task');
  const ext = validateTaskImageBuffer(buffer);
  fs.mkdirSync(/*turbopackIgnore: true*/ imageDir(), { recursive: true });
  deleteTaskImage(taskId);
  const filename = `${taskId}.${ext}`;
  fs.writeFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ imageDir(), filename), buffer);
  return { filename, publicPath: taskImagePublicPath(taskId) };
}

export function readTaskImage(taskId: string): { buffer: Buffer; ext: string; contentType: string } | null {
  if (!/^[a-f0-9-]{36}$/i.test(taskId)) return null;
  for (const ext of EXTS) {
    const filePath = path.join(/*turbopackIgnore: true*/ imageDir(), `${taskId}.${ext}`);
    if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) continue;
    return {
      buffer: fs.readFileSync(/*turbopackIgnore: true*/ filePath),
      ext,
      contentType: taskImageContentType(ext),
    };
  }
  return null;
}

export function deleteTaskImage(taskId: string): void {
  if (!/^[a-f0-9-]{36}$/i.test(taskId)) return;
  for (const ext of EXTS) {
    const filePath = path.join(/*turbopackIgnore: true*/ imageDir(), `${taskId}.${ext}`);
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) fs.unlinkSync(/*turbopackIgnore: true*/ filePath);
    } catch (err) {
      console.error('[bossnote] failed to remove image', filePath, err);
    }
  }
}
