'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import type { JobDto } from '@/lib/job-types';

const ACTIVE = new Set(['queued', 'running']);

export function QueueList({ initialJobs }: { initialJobs: JobDto[] }) {
  const [jobs, setJobs] = useState<JobDto[]>(initialJobs);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
      }
    } catch {
      // transient; next tick retries
    }
  }, []);

  // Poll every 2s while any job is active; stop when everything is terminal.
  useEffect(() => {
    const anyActive = jobs.some((j) => ACTIVE.has(j.status));
    if (!anyActive) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    if (!timer.current) {
      timer.current = setInterval(refresh, 2000);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [jobs, refresh]);

  async function cancel(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/jobs/${id}/cancel`, { method: 'POST' });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center text-zinc-500">
        No generations yet.{' '}
        <Link href="/generate" className="text-fuchsia-400 hover:underline">
          Create your first video
        </Link>
        .
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {jobs.map((job) => (
        <li key={job.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusBadge status={job.status} />
                <span className="text-xs text-zinc-500">
                  {job.params.durationSec}s · {job.params.aspectRatio} · {job.params.stylePreset}
                </span>
              </div>
              <p className="mt-2 truncate text-sm text-zinc-300" title={job.prompt}>
                {job.prompt}
              </p>
              {job.status === 'failed' && job.error && (
                <p className="mt-1 text-xs text-red-400">{job.error}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {job.status === 'succeeded' && (
                <Link
                  href="/library"
                  className="rounded-md bg-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-500"
                >
                  View
                </Link>
              )}
              {(job.status === 'queued' || job.status === 'running') && (
                <button
                  onClick={() => cancel(job.id)}
                  disabled={busy === job.id}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {busy === job.id ? 'Canceling…' : 'Cancel'}
                </button>
              )}
            </div>
          </div>

          {job.status === 'running' && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{ width: `${Math.max(5, job.progress)}%` }}
                />
              </div>
              <div className="mt-1 text-right text-xs text-zinc-500">{job.progress}%</div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
