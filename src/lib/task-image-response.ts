import { NextResponse } from 'next/server';

export function imageFileResponse(file: { buffer: Buffer; contentType: string }) {
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.buffer.length),
      'Cache-Control': 'private, no-cache',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
