import fs from 'fs';
import path from 'path';

// Uploads live outside the repo tree so rsync --delete on deploy can't wipe them.
const VOICE_DIR = process.env.VOICE_UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads', 'voices');

const ALLOWED = new Set(['webm', 'mp4', 'm4a', 'ogg', 'oga', 'wav', 'mp3']);
const MAX_BYTES = 25 * 1024 * 1024;

export function voiceExt(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ALLOWED.has(fromName)) return fromName;
  const fromMime = file.type.split(';')[0].split('/')[1]?.toLowerCase() ?? '';
  return ALLOWED.has(fromMime) ? fromMime : 'webm';
}

/** Validates and persists a voice upload. Returns the public URL path. */
export function saveVoice(id: string, buffer: Buffer, ext: string): string {
  if (buffer.length === 0) throw new Error('Voice recording is empty');
  if (buffer.length > MAX_BYTES) throw new Error('Voice recording too large (max 25MB)');
  if (!ALLOWED.has(ext)) throw new Error(`Unsupported audio format: ${ext}`);

  fs.mkdirSync(VOICE_DIR, { recursive: true });
  fs.writeFileSync(path.join(VOICE_DIR, `${id}.${ext}`), buffer);
  return `/api/voice/${id}.${ext}`;
}

export function readVoice(filename: string): Buffer {
  // Reject traversal: only <uuid>.<ext> is addressable.
  if (!/^[a-f0-9-]{36}\.[a-z0-9]{2,4}$/i.test(filename)) throw new Error('Invalid filename');
  return fs.readFileSync(path.join(VOICE_DIR, filename));
}
