import type { Job, Video } from '@reelforge/db';
import { parseJobParams, type JobParams } from '@reelforge/core';

export interface JobDto {
  id: string;
  status: Job['status'];
  prompt: string;
  params: JobParams;
  costCredits: number;
  progress: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  video: {
    mp4Url: string;
    thumbUrl: string;
    durationSec: number;
    width: number;
    height: number;
    sizeBytes: number;
  } | null;
}

export function toJobDto(
  job: Job,
  video: Video | null,
  urls?: { mp4Url: string; thumbUrl: string }
): JobDto {
  return {
    id: job.id,
    status: job.status,
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

function safeParams(json: string): JobParams {
  try {
    return parseJobParams(json);
  } catch {
    return { durationSec: 0, aspectRatio: '16:9', stylePreset: 'cinematic' };
  }
}
