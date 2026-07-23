import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@reelforge/db';
import { generateRequestSchema, ModerationError } from '@reelforge/core';
import { InsufficientCreditsError } from '@reelforge/db';
import { getApiUser } from '@/lib/session';
import { RateLimitError, submitJob } from '@/lib/jobs';
import { jobToDto } from '@/lib/job-urls';

export const dynamic = 'force-dynamic';

// GET /api/jobs — the caller's jobs, most recent first (queue + library polling).
export async function GET(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status');
  const jobs = await prisma.job.findMany({
    where: { userId: user.id, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { video: true },
  });
  return NextResponse.json({ jobs: await Promise.all(jobs.map(jobToDto)) });
}

// POST /api/jobs — submit a generation request.
export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = generateRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid request', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { job } = await submitJob(user, parsed.data);
    const full = await prisma.job.findUniqueOrThrow({ where: { id: job.id }, include: { video: true } });
    return NextResponse.json({ job: await jobToDto(full) }, { status: 201 });
  } catch (e) {
    if (e instanceof ModerationError) {
      return NextResponse.json({ error: e.message, category: e.category }, { status: 422 });
    }
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: 'Not enough credits', needed: e.needed, available: e.available },
        { status: 402 }
      );
    }
    throw e;
  }
}
