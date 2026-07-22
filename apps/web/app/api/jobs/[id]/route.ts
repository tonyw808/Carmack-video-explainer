import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@reelforge/db';
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
