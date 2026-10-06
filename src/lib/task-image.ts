/** Stored file cap. Larger originals are compressed in the browser before upload. */
export const TASK_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Gallery size. Extra picks are skipped; the task still saves. */
export const TASK_IMAGE_MAX_COUNT = 8;
/** Longest side after a large photo is compressed. Small screenshots stay original. */
export const TASK_IMAGE_MAX_SIDE = 2000;
/** JPEG/PNG/WebP/GIF at or under this size are stored unchanged so text stays sharp. */
export const TASK_IMAGE_COMPRESS_OVER_BYTES = 3_500_000;
/** First JPEG pass. Further passes use 1600px/0.72 and 1280px/0.60 if still over 8MB. */
export const TASK_IMAGE_JPEG_QUALITY = 0.85;
/** Highest `{taskId}-{n}` slot. Matches the cleanup job's filename check. */
export const TASK_IMAGE_MAX_INDEX = 31;
/**
 * Done tasks older than this are removed by `scripts/cleanup-old-tasks.mjs`,
 * including every screenshot file. See migrations/006_add_users.sql.
 */
export const DONE_TASK_RETENTION_MONTHS = 6;

export type TaskImageCompressStep = { maxSide: number; quality: number };

const IMAGE_NAME_EXT = '(?:jpe?g|png|webp|gif|heic|heif)';

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

export function taskImageContentType(ext: string): string {
  return EXT_MIME[ext.toLowerCase()] || 'application/octet-stream';
}

export type TaskImageRef = {
  id: string;
  image_path?: string | null;
  image_paths?: unknown;
  updated_at?: string | null;
};

function cacheBust(publicPath: string, task: TaskImageRef): string {
  const version = task.updated_at || task.id;
  const join = publicPath.includes('?') ? '&' : '?';
  return `${publicPath}${join}v=${encodeURIComponent(version)}`;
}

/** Public URL for one slot. Index 0 keeps the original `/image` path. */
export function taskImagePublicPath(taskId: string, index: number): string {
  if (index <= 0) return `/api/tasks/${taskId}/image`;
  return `/api/tasks/${taskId}/image/${index}`;
}

export function imageIndexFromPublicPath(taskId: string, publicPath: string): number | null {
  if (!/^[a-f0-9-]{36}$/i.test(taskId)) return null;
  const pathOnly = String(publicPath || '').split('?')[0].replace(/\/+$/, '');
  const base = `/api/tasks/${taskId}/image`;
  if (pathOnly.toLowerCase() === base.toLowerCase()) return 0;
  const match = pathOnly.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(\\d{1,2})$`, 'i'));
  if (!match) return null;
  const index = Number(match[1]);
  if (!Number.isInteger(index) || index < 0 || index > TASK_IMAGE_MAX_INDEX) return null;
  return index;
}

/** `taskId.jpg` (legacy) and `taskId-3.png` belong to the task. Anything else does not. */
export function imageIndexFromFilename(taskId: string, filename: string): number | null {
  if (!/^[a-f0-9-]{36}$/i.test(taskId)) return null;
  const name = String(filename || '');
  const escaped = taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^${escaped}\\.${IMAGE_NAME_EXT}$`, 'i').test(name)) return 0;
  const match = name.match(new RegExp(`^${escaped}-(\\d{1,2})\\.${IMAGE_NAME_EXT}$`, 'i'));
  if (!match) return null;
  const index = Number(match[1]);
  if (!Number.isInteger(index) || index < 0 || index > TASK_IMAGE_MAX_INDEX) return null;
  return index;
}

export function isTaskImageFilename(taskId: string, filename: string): boolean {
  return imageIndexFromFilename(taskId, filename) !== null;
}

export function taskImagePaths(task: {
  image_path?: string | null;
  image_paths?: unknown;
}): string[] {
  const raw = task.image_paths;
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const paths = list.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (paths.length > 0) return paths;
  if (task.image_path && task.image_path.trim()) return [task.image_path.trim()];
  return [];
}

export function nextImageIndex(taskId: string, paths: string[], filenames: string[]): number {
  let max = -1;
  for (const publicPath of paths) {
    const index = imageIndexFromPublicPath(taskId, publicPath);
    if (index !== null) max = Math.max(max, index);
  }
  for (const filename of filenames) {
    const index = imageIndexFromFilename(taskId, filename);
    if (index !== null) max = Math.max(max, index);
  }
  return max + 1;
}

export function taskImageSrc(task: TaskImageRef): string {
  const first = taskImagePaths(task)[0];
  if (!first) return '';
  return cacheBust(first, task);
}

/** Every screenshot, cache-busted. List cards use the first plus `length`. */
export function taskImageSources(task: TaskImageRef): string[] {
  return taskImagePaths(task).map((publicPath) => cacheBust(publicPath, task));
}

export function taskImageSlots(task: TaskImageRef): { index: number; src: string }[] {
  return taskImagePaths(task).flatMap((publicPath) => {
    const index = imageIndexFromPublicPath(task.id, publicPath);
    if (index === null) return [];
    return [{ index, src: cacheBust(publicPath, task) }];
  });
}

/**
 * null = keep the original file (sharp screenshot).
 * HEIC and photos over 3.5MB get one 2000px JPEG pass.
 * Originals over 8MB also try 1600px/0.72 and 1280px/0.60 until the file fits.
 */
export function taskImageCompressSteps(input: { size: number; heic: boolean }): TaskImageCompressStep[] | null {
  const first = { maxSide: TASK_IMAGE_MAX_SIDE, quality: TASK_IMAGE_JPEG_QUALITY };
  if (!input.heic && input.size <= TASK_IMAGE_COMPRESS_OVER_BYTES) return null;
  if (input.size <= TASK_IMAGE_MAX_BYTES) return [first];
  return [
    first,
    { maxSide: 1600, quality: 0.72 },
    { maxSide: 1280, quality: 0.6 },
  ];
}

/** Magic-byte check so a renamed SVG or HTML file is never stored as a screenshot. */
export function sniffImageExt(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }
  if (buffer.length >= 6) {
    const gif = buffer.subarray(0, 6).toString('ascii');
    if (gif === 'GIF87a' || gif === 'GIF89a') return 'gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand.startsWith('hei') || brand === 'mif1' || brand === 'msf1' || brand === 'heic') return 'heic';
  }
  return null;
}

export function validateTaskImageBuffer(buffer: Buffer, maxBytes = TASK_IMAGE_MAX_BYTES): string {
  if (buffer.length === 0) throw new Error('That photo is empty.');
  if (buffer.length > maxBytes) {
    const mb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    throw new Error(`Photo is too large (max ${mb}MB). Try a smaller screenshot.`);
  }
  const ext = sniffImageExt(buffer);
  if (!ext) throw new Error('That file is not a JPEG, PNG, WebP, GIF, or HEIC screenshot.');
  return ext;
}

/**
 * Client-side type check before compression. Size is not rejected here:
 * oversized photos are scaled down in `prepareTaskImage`, and the server
 * still refuses a stored file over 8MB.
 */
export function validateTaskImageInput(file: { size: number; type: string; name: string }): string | null {
  if (!file || file.size <= 0) return 'That photo is empty.';
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const allowedType = type.startsWith('image/') && !type.includes('svg');
  const allowedName = /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name);
  if (!allowedType && !allowedName) return 'Use a JPEG, PNG, or WebP screenshot.';
  return null;
}
