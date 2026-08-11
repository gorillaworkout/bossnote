import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { readVoice } from '@/lib/voice-storage';

const MIME: Record<string, string> = {
  webm: 'audio/webm', mp4: 'audio/mp4', m4a: 'audio/mp4',
  ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ file: string }> },
) {
  // Voice notes are private — only the two authenticated users may stream them.
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { file } = await params;
  try {
    const buffer = readVoice(file);
    const ext = file.split('.').pop()!.toLowerCase();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
