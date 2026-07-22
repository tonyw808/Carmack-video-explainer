import type { JobStatus } from '@/lib/job-types';

const STYLES: Record<JobStatus, string> = {
  queued: 'border-zinc-600 bg-zinc-800 text-zinc-300',
  running: 'border-sky-700 bg-sky-950 text-sky-300',
  succeeded: 'border-emerald-800 bg-emerald-950 text-emerald-300',
  failed: 'border-red-800 bg-red-950 text-red-300',
  canceled: 'border-zinc-700 bg-zinc-900 text-zinc-400',
};

const LABELS: Record<JobStatus, string> = {
  queued: 'Queued',
  running: 'Generating',
  succeeded: 'Ready',
  failed: 'Failed',
  canceled: 'Canceled',
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
