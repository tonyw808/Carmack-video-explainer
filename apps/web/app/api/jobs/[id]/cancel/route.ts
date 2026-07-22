// Cancel a job that is queued or running. Atomic flip to canceled + refund; the worker
// detects the change and aborts any in-flight generation.
import { NextRequest, NextResponse } from 'next/server';
import { cancelJob, prisma } from '@reelforge/db';
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

  const result = await cancelJob(prisma, job);
  if (result === 'already_terminal') {
    return NextResponse.json({ error: 'Job has already finished.' }, { status: 409 });
  }
  return NextResponse.json({ status: 'canceled', refunded: job.costCredits });
}
