// Admin-only manual refund. Idempotent (reference manual_refund:<jobId>), so double-clicks
// or retries never double-credit. Allowed regardless of job status (e.g. a goodwill refund
// on a succeeded job), but never stacks on an existing refund of the same job.
import { NextRequest, NextResponse } from 'next/server';
import { prisma, refundJob } from '@reelforge/db';
import { getApiUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Guard: don't allow a manual refund if the job's credits were already returned.
  const existing = await prisma.creditLedgerEntry.findFirst({
    where: {
      reason: { in: ['job_refund', 'job_cancel_refund', 'manual_refund'] },
      reference: { in: [`job_refund:${id}`, `job_cancel_refund:${id}`, `manual_refund:${id}`] },
    },
  });
  if (existing) {
    return NextResponse.json({ error: 'This job has already been refunded.' }, { status: 409 });
  }

  await refundJob(prisma, job, 'manual_refund');
  return NextResponse.json({ refunded: job.costCredits });
}
