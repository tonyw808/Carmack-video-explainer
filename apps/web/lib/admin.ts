// Admin data helpers (role-gated at the page/route level). Read-only aggregates plus a
// cross-user job feed for failure inspection.
import { prisma } from '@reelforge/db';

export interface AdminStats {
  users: number;
  jobs: number;
  jobsByStatus: Record<string, number>;
  videos: number;
  creditsPurchased: number;
  creditsSpent: number;
  creditsRefunded: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const [users, jobs, videos, statusGroups, ledgerGroups] = await Promise.all([
    prisma.user.count(),
    prisma.job.count(),
    prisma.video.count(),
    prisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.creditLedgerEntry.groupBy({ by: ['reason'], _sum: { delta: true } }),
  ]);

  const jobsByStatus: Record<string, number> = {};
  for (const g of statusGroups) jobsByStatus[g.status] = g._count._all;

  const sumFor = (reasons: string[]) =>
    ledgerGroups
      .filter((g) => reasons.includes(g.reason))
      .reduce((acc, g) => acc + (g._sum.delta ?? 0), 0);

  return {
    users,
    jobs,
    jobsByStatus,
    videos,
    creditsPurchased: sumFor(['purchase', 'signup_bonus']),
    creditsSpent: -sumFor(['job_reserve']), // stored negative
    creditsRefunded: sumFor(['job_refund', 'job_cancel_refund', 'manual_refund']),
  };
}

export interface AdminJobRow {
  id: string;
  userEmail: string;
  status: string;
  prompt: string;
  costCredits: number;
  error: string | null;
  providerLog: string | null;
  providerName: string;
  createdAt: string;
  refundable: boolean;
}

export async function getAdminJobs(limit = 100): Promise<AdminJobRow[]> {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { email: true } } },
  });

  // A job is manually refundable if it hasn't already been auto-refunded/canceled.
  const refundedRefs = new Set(
    (
      await prisma.creditLedgerEntry.findMany({
        where: { reason: { in: ['job_refund', 'job_cancel_refund', 'manual_refund'] } },
        select: { reference: true },
      })
    ).map((r) => r.reference)
  );

  return jobs.map((j) => ({
    id: j.id,
    userEmail: j.user.email,
    status: j.status,
    prompt: j.prompt,
    costCredits: j.costCredits,
    error: j.error,
    providerLog: j.providerLog,
    providerName: j.providerName,
    createdAt: j.createdAt.toISOString(),
    refundable:
      j.costCredits > 0 &&
      !refundedRefs.has(`job_refund:${j.id}`) &&
      !refundedRefs.has(`job_cancel_refund:${j.id}`) &&
      !refundedRefs.has(`manual_refund:${j.id}`),
  }));
}
