export const TASK_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

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

export function taskImageSrc(task: {
  id: string;
  image_path?: string | null;
  updated_at?: string | null;
}): string {
  if (!task.image_path) return '';
  const version = task.updated_at || task.id;
  const join = task.image_path.includes('?') ? '&' : '?';
  return `${task.image_path}${join}v=${encodeURIComponent(version)}`;
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

/** Client-side check before we try to upload. HEIC may still be converted in the browser. */
export function validateTaskImageInput(file: { size: number; type: string; name: string }): string | null {
  if (!file || file.size <= 0) return 'That photo is empty.';
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const allowedType = type.startsWith('image/') && !type.includes('svg');
  const allowedName = /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name);
  if (!allowedType && !allowedName) return 'Use a JPEG, PNG, or WebP screenshot.';
  if (file.size > TASK_IMAGE_MAX_BYTES && !type.includes('heic') && !type.includes('heif') && !name.endsWith('.heic') && !name.endsWith('.heif')) {
    return 'Photo is too large (max 8MB). Try a smaller screenshot.';
  }
  return null;
}
