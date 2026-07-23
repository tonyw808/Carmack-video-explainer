import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@reelforge/db';
import { getStorage } from '@reelforge/storage';
import { getApiUser } from '@/lib/session';
import { jobToDto } from '@/lib/job-urls';

export const dynamic = 'force-dynamic';

// GET /api/jobs/:id — single job status (polling). Scoped to the owner.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id }, include: { video: true } });
  if (!job || job.userId !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ job: await jobToDto(job) });
}

// DELETE /api/jobs/:id — remove a job and its video from the library. Storage objects are
// deleted first; the append-only credit ledger is untouched (history is preserved).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id }, include: { video: true } });
  if (!job || job.userId !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (job.status === 'running' || job.status === 'queued') {
    return NextResponse.json({ error: 'Cannot delete an active job. Cancel it first.' }, { status: 409 });
  }

  if (job.video) {
    const storage = getStorage();
    await storage.delete(job.video.storageKeyMp4).catch(() => {});
    await storage.delete(job.video.storageKeyThumb).catch(() => {});
  }
  await prisma.job.delete({ where: { id } }); // Video cascades

  return NextResponse.json({ deleted: true });
}
