import Link from 'next/link';
import { prisma } from '@reelforge/db';
import { requireUser } from '@/lib/session';
import { jobToDto } from '@/lib/job-urls';
import { LibraryGrid } from './library-grid';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const user = await requireUser();
  const jobs = await prisma.job.findMany({
    where: { userId: user.id, status: 'succeeded', video: { isNot: null } },
    orderBy: { createdAt: 'desc' },
    include: { video: true },
  });
  const dtos = await Promise.all(jobs.map(jobToDto));

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Library</h1>
        <Link href="/generate" className="text-sm text-fuchsia-400 hover:text-fuchsia-300">
          + New generation
        </Link>
      </div>
      {dtos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center text-zinc-500">
          No finished videos yet.{' '}
          <Link href="/generate" className="text-fuchsia-400 hover:underline">
            Generate one
          </Link>
          .
        </div>
      ) : (
        <LibraryGrid initialVideos={dtos} />
      )}
    </div>
  );
}
