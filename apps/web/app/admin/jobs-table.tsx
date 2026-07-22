'use client';

import { Fragment, useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import type { JobStatus } from '@/lib/job-types';

interface AdminJobRow {
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

export function AdminJobsTable({ initialJobs }: { initialJobs: AdminJobRow[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refund(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/jobs/${id}/refund`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Refund failed');
      setMsg(`Refunded ${data.refunded} credits for ${id.slice(0, 12)}…`);
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, refundable: false } : j)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Refund failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {msg && <div className="mb-3 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">{msg}</div>}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Prompt</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <Fragment key={job.id}>
                <tr className="border-t border-zinc-800">
                  <td className="px-3 py-2 text-zinc-400">{job.userEmail}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={job.status as JobStatus} />
                  </td>
                  <td className="max-w-xs truncate px-3 py-2" title={job.prompt}>
                    {job.prompt}
                  </td>
                  <td className="px-3 py-2 text-right">{job.costCredits}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      {(job.status === 'failed' || job.providerLog) && (
                        <button
                          onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                        >
                          {expanded === job.id ? 'Hide' : 'Inspect'}
                        </button>
                      )}
                      {job.refundable && (
                        <button
                          onClick={() => refund(job.id)}
                          disabled={busy === job.id}
                          className="rounded border border-amber-800 bg-amber-950/40 px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/40 disabled:opacity-50"
                        >
                          {busy === job.id ? '…' : 'Refund'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded === job.id && (
                  <tr className="border-t border-zinc-800 bg-zinc-950">
                    <td colSpan={5} className="px-3 py-3">
                      <div className="space-y-2 text-xs">
                        <div>
                          <span className="text-zinc-500">Job ID:</span>{' '}
                          <span className="font-mono text-zinc-300">{job.id}</span>
                          <span className="ml-4 text-zinc-500">Provider:</span>{' '}
                          <span className="text-zinc-300">{job.providerName}</span>
                        </div>
                        {job.error && (
                          <div>
                            <span className="text-zinc-500">User-facing error:</span>{' '}
                            <span className="text-red-300">{job.error}</span>
                          </div>
                        )}
                        {job.providerLog && (
                          <div>
                            <div className="text-zinc-500">Provider log:</div>
                            <pre className="mt-1 overflow-x-auto rounded bg-black/60 p-2 text-zinc-400">
                              {job.providerLog}
                            </pre>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
