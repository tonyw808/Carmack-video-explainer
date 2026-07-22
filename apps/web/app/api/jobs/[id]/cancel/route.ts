// Cancel a job that hasn't started yet (queued). Atomic + refunds. Canceling a running job
// is a Slice 6 concern (it requires signaling the worker).
import { NextRequest, NextResponse } from 'next/server';
import { cancelQueuedJob, prisma } from '@reelforge/db';
import { getApiUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job || job.userId !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const result = await cancelQueuedJob(prisma, job);
  if (result === 'not_queued') {
    return NextResponse.json(
      { error: 'Job has already started or finished and cannot be canceled here.' },
      { status: 409 }
    );
  }
  return NextResponse.json({ status: 'canceled', refunded: job.costCredits });
}
