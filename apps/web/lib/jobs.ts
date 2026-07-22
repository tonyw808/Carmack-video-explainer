// Job submission service: the one authoritative path from a validated request to an
// enqueued job. Enforces moderation, per-user rate limiting, authoritative pricing, and an
// atomic credit reservation before the job becomes visible to the worker.
import {
  createJobWithReservation,
  loadPricing,
  prisma,
  recentJobCount,
  type Job,
} from '@reelforge/db';
import { getQueue } from '@reelforge/queue';
import {
  assertPromptAllowed,
  computeJobCost,
  serializeJobParams,
  type GenerateRequest,
} from '@reelforge/core';
import { envInt } from '@reelforge/core/env';

export class RateLimitError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`Rate limit exceeded: max ${limit} generations per minute`);
    this.name = 'RateLimitError';
    this.limit = limit;
  }
}

function providerName(): string {
  return process.env.VIDEO_PROVIDER ?? 'mock';
}

export async function costForRequest(durationSec: number): Promise<number> {
  const pricing = await loadPricing(prisma);
  return computeJobCost({ durationSec }, pricing);
}

/**
 * Submit a generation request. Throws ModerationError (blocked prompt), RateLimitError, or
 * InsufficientCreditsError; on success the job is persisted 'queued', credits are reserved,
 * and the job is enqueued for the worker.
 */
export async function submitJob(
  user: { id: string },
  request: GenerateRequest
): Promise<{ job: Job; cost: number }> {
  // 1. Moderation — the last gate before we spend money.
  assertPromptAllowed(request.prompt);

  // 2. Rate limit per user (rolling 60s window).
  const limit = envInt('RATE_LIMIT_JOBS_PER_MINUTE', 6);
  if ((await recentJobCount(prisma, user.id, 60_000)) >= limit) {
    throw new RateLimitError(limit);
  }

  // 3. Authoritative cost (same pure function the client used for the preview).
  const cost = await costForRequest(request.durationSec);

  // 4. Atomic reserve + create.
  const paramsJson = serializeJobParams({
    durationSec: request.durationSec,
    aspectRatio: request.aspectRatio,
    stylePreset: request.stylePreset,
    referenceImageKey: request.referenceImageKey,
  });
  const job = await createJobWithReservation(prisma, {
    userId: user.id,
    prompt: request.prompt,
    paramsJson,
    costCredits: cost,
    providerName: providerName(),
  });

  // 5. Signal the worker (no-op for the db driver; a real push for bullmq).
  await getQueue().enqueue(job.id);

  return { job, cost };
}
