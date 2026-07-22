import type { Job, Video } from '@reelforge/db';
import { parseJobParams } from '@reelforge/core';
import type { JobDto, JobStatus } from './job-types';

export type { JobDto } from './job-types';

export function toJobDto(
  job: Job,
  video: Video | null,
  urls?: { mp4Url: string; thumbUrl: string }
): JobDto {
  return {
    id: job.id,
    status: job.status as JobStatus,
    prompt: job.prompt,
    params: safeParams(job.paramsJson),
    costCredits: job.costCredits,
    progress: job.progress,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    video:
      video && urls
        ? {
            mp4Url: urls.mp4Url,
            thumbUrl: urls.thumbUrl,
            durationSec: video.durationSec,
            width: video.width,
            height: video.height,
            sizeBytes: video.sizeBytes,
          }
        : null,
  };
}

function safeParams(json: string) {
  try {
    return parseJobParams(json);
  } catch {
    return { durationSec: 0, aspectRatio: '16:9' as const, stylePreset: 'cinematic' as const };
  }
}
