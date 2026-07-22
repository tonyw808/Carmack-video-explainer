// Client-safe job shapes. No server imports here, so client components can use these
// types without pulling Prisma/@reelforge/db into the browser bundle.
import type { JobParams } from '@reelforge/core/params';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface JobVideoDto {
  mp4Url: string;
  thumbUrl: string;
  durationSec: number;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface JobDto {
  id: string;
  status: JobStatus;
  prompt: string;
  params: JobParams;
  costCredits: number;
  progress: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  video: JobVideoDto | null;
}
