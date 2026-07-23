'use client';

import { useState } from 'react';
import type { JobDto } from '@/lib/job-types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function LibraryGrid({ initialVideos }: { initialVideos: JobDto[] }) {
  const [videos, setVideos] = useState<JobDto[]>(initialVideos);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function onDelete(id: string) {
    if (!confirm('Delete this video permanently?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      if (res.ok) setVideos((v) => v.filter((j) => j.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function onDownload(job: JobDto) {
    if (!job.video) return;
    // Fetch as a blob so the browser saves rather than navigates (auth cookie is sent).
    const res = await fetch(job.video.mp4Url);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reelforge-${job.id}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((job) => (
        <div key={job.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
          {job.video && (
            <video
              controls
              preload="metadata"
              poster={job.video.thumbUrl}
              className="aspect-video w-full bg-black"
              src={job.video.mp4Url}
            />
          )}
          <div className="p-4">
            <p className="line-clamp-2 text-sm text-zinc-300" title={job.prompt}>
              {job.prompt}
            </p>
            {job.video && (
              <p className="mt-1 text-xs text-zinc-500">
                {job.video.width}×{job.video.height} · {job.video.durationSec}s ·{' '}
                {formatBytes(job.video.sizeBytes)}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onDownload(job)}
                className="flex-1 rounded-md bg-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-500"
              >
                Download
              </button>
              <button
                onClick={() => onDelete(job.id)}
                disabled={deleting === job.id}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-red-300 disabled:opacity-50"
              >
                {deleting === job.id ? '…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
