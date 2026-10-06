import {
  TASK_IMAGE_MAX_BYTES,
  taskImageCompressSteps,
  validateTaskImageInput,
} from '@/lib/task-image';

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

async function compressToJpeg(file: File, maxSide: number, quality: number): Promise<File> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
  canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('blob');
  return new File([blob], 'screenshot.jpg', { type: 'image/jpeg' });
}

/**
 * Keep small PNG/JPEG screenshots sharp (at or under 3.5MB, longest side unchanged).
 * Convert HEIC and shrink oversized photos before upload:
 * 2000px JPEG at quality 0.85, then 1600px/0.72 and 1280px/0.60 if the original
 * is over 8MB and the first pass still does not fit. The server stores at most 8MB.
 */
export async function prepareTaskImage(file: File): Promise<{ file: File; error: string | null }> {
  const problem = validateTaskImageInput({ size: file.size, type: file.type, name: file.name });
  if (problem) return { file, error: problem };

  const steps = taskImageCompressSteps({ size: file.size, heic: isHeic(file) });
  if (!steps) return { file, error: null };

  let last: File | null = null;
  try {
    for (const step of steps) {
      last = await compressToJpeg(file, step.maxSide, step.quality);
      if (last.size > 0 && last.size <= TASK_IMAGE_MAX_BYTES) return { file: last, error: null };
    }
    return {
      file: last || file,
      error: 'Photo is too large (max 8MB). Try a smaller screenshot.',
    };
  } catch {
    if (!isHeic(file) && file.size <= TASK_IMAGE_MAX_BYTES) return { file, error: null };
    return {
      file,
      error: 'Could not prepare this photo. Use a JPEG or PNG screenshot. You can still create the task without it.',
    };
  }
}
