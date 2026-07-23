import Link from 'next/link';
import { prisma } from '@reelforge/db';
import { requireUser } from '@/lib/session';
import { jobToDto } from '@/lib/job-urls';
import { QueueList } from './queue-list';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const user = await requireUser();
  const jobs = await prisma.job.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { video: true },
  });
  const dtos = await Promise.all(jobs.map(jobToDto));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Your queue</h1>
        <Link href="/generate" className="text-sm text-fuchsia-400 hover:text-fuchsia-300">
          + New generation
        </Link>
      </div>
      <QueueList initialJobs={dtos} />
    </div>
  );
}
