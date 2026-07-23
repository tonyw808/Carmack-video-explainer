// Reference-image upload for the generate page. Stores the image under an owner-namespaced
// key and returns it; the key is later passed as referenceImageKey on job submission.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getStorage } from '@reelforge/storage';
import { getApiUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json({ error: 'unsupported image type (use JPEG, PNG, or WebP)' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'image exceeds 10MB' }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = `uploads/${user.id}/${randomUUID()}.${ext}`;
  await getStorage().put(key, bytes, file.type);
  return NextResponse.json({ key });
}
