// Authenticated file serving for the local storage driver. Objects are NOT public: the
// caller must own the key (keys are namespaced videos/<userId>/…) or be an admin. In
// production (STORAGE_DRIVER=s3) clients use signed URLs and never hit this route.
import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { getStorage, LocalStorageDriver } from '@reelforge/storage';
import { getApiUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function extType(key: string): string {
  const dot = key.lastIndexOf('.');
  return (dot >= 0 && CONTENT_TYPES[key.slice(dot).toLowerCase()]) || 'application/octet-stream';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { key: segments } = await params;
  const key = segments.join('/');

  // Ownership: keys are namespaced by user id; admins may read any.
  if (user.role !== 'admin' && !key.startsWith(`videos/${user.id}/`)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const storage = getStorage();
  if (!(storage instanceof LocalStorageDriver)) {
    // Non-local storage serves via signed URLs; this route is not the access path.
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const filePath = storage.resolvePath(key);
  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const contentType = (await storage.contentType(key)) ?? extType(key);
  const range = req.headers.get('range');

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : size - 1;
      if (start >= size || end >= size || start > end) {
        return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }
      const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
      return new NextResponse(stream, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
