import { TASK_IMAGE_MAX_BYTES, validateTaskImageInput } from '@/lib/task-image';

const COMPRESS_OVER = 3_500_000;
const MAX_SIDE = 2000;

function isHeic(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    img.src = url;
  });
}

async function compressToJpeg(file: File): Promise<File> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width || 1, img.height || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
  canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('blob');
  return new File([blob], 'screenshot.jpg', { type: 'image/jpeg' });
}

/**
 * Keep small PNG/JPEG screenshots sharp. Convert HEIC and shrink oversized photos
 * so the upload is reliable and the boss can still read the bug.
 */
export async function prepareTaskImage(file: File): Promise<{ file: File; error: string | null }> {
  const heic = isHeic(file);
  if (!heic) {
    const problem = validateTaskImageInput({ size: file.size, type: file.type, name: file.name });
    if (problem) return { file, error: problem };
    if (file.size <= COMPRESS_OVER) return { file, error: null };
  }

  try {
    const next = await compressToJpeg(file);
    if (next.size <= 0) throw new Error('empty');
    if (next.size > TASK_IMAGE_MAX_BYTES) {
      return { file: next, error: 'Photo is too large (max 8MB). Try a smaller screenshot.' };
    }
    return { file: next, error: null };
  } catch {
    if (!heic && file.size <= TASK_IMAGE_MAX_BYTES) return { file, error: null };
    return {
      file,
      error: 'Could not prepare this photo. Use a JPEG or PNG screenshot. You can still create the task without it.',
    };
  }
}
