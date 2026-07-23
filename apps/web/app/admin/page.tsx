import { requireAdmin } from '@/lib/session';
import { getAdminJobs, getAdminStats } from '@/lib/admin';
import { AdminJobsTable } from './jobs-table';

export const dynamic = 'force-dynamic';

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone ?? 'text-zinc-100'}`}>{value}</div>
    </div>
  );
}

export default async function AdminPage() {
  await requireAdmin();
  const [stats, jobs] = await Promise.all([getAdminStats(), getAdminJobs()]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-zinc-500">Usage</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Users" value={stats.users} />
          <StatCard label="Jobs" value={stats.jobs} />
          <StatCard label="Videos" value={stats.videos} />
          <StatCard label="Succeeded" value={stats.jobsByStatus.succeeded ?? 0} tone="text-emerald-400" />
          <StatCard label="Failed" value={stats.jobsByStatus.failed ?? 0} tone="text-red-400" />
          <StatCard label="Credits purchased" value={stats.creditsPurchased} tone="text-fuchsia-400" />
          <StatCard label="Credits spent" value={stats.creditsSpent} />
          <StatCard label="Credits refunded" value={stats.creditsRefunded} tone="text-amber-400" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-zinc-500">
          All jobs
        </h2>
        <AdminJobsTable initialJobs={jobs} />
      </section>
    </div>
  );
}
