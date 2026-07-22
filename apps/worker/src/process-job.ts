// Processes a single claimed job end-to-end: run the provider, store artifacts, persist the
// video, and mark terminal status. On provider failure the job is marked failed with a
// user-safe message and its credits are refunded. On graceful-shutdown abort the in-flight
// job is re-queued (credits stay reserved) so no work is lost.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma, refundJob } from '@reelforge/db';
import { getStorage } from '@reelforge/storage';
import { getVideoProvider, ProviderError, type ProviderJobInput } from '@reelforge/video-provider';
import { parseJobParams, repoRootPath } from '@reelforge/core';
import { envInt } from '@reelforge/core/env';

function workRoot(): string {
  const configured = process.env.WORK_ROOT ?? '.data/work';
  return path.isAbsolute(configured) ? configured : path.resolve(repoRootPath(), configured);
}

export interface ProcessContext {
  /** Aborted on graceful shutdown; forwarded to the provider wait. */
  signal: AbortSignal;
  /** True while the worker is shutting down (distinguishes re-queue from user cancel). */
  isShuttingDown: () => boolean;
}

async function updateProgress(jobId: string, percent: number): Promise<void> {
  try {
    await prisma.job.updateMany({
      where: { id: jobId, status: 'running' },
      data: { progress: percent },
    });
  } catch {
    // progress is best-effort; never fail a job over a progress write
  }
}

export async function processJob(jobId: string, ctx: ProcessContext): Promise<void> {
  const provider = getVideoProvider();
  const storage = getStorage();

  // Idempotently ensure the job is 'running' (the db driver already claimed it; other
  // drivers deliver a still-'queued' row). Only a queued→running transition sets timing.
  await prisma.job.updateMany({
    where: { id: jobId, status: 'queued' },
    data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
  });

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.status === 'canceled') return; // canceled while queued
  if (job.status !== 'running') return; // already terminal (duplicate delivery)

  const params = parseJobParams(job.paramsJson);
  const dir = path.join(workRoot(), jobId);
  await mkdir(dir, { recursive: true });

  const input: ProviderJobInput = {
    jobId,
    prompt: job.prompt,
    params,
    workDir: dir,
  };

  // Materialize a reference image onto disk for the provider, if one was supplied.
  if (params.referenceImageKey) {
    try {
      const bytes = await storage.get(params.referenceImageKey);
      const refPath = path.join(dir, 'reference' + path.extname(params.referenceImageKey));
      await writeFile(refPath, bytes);
      input.referenceImagePath = refPath;
    } catch {
      // a missing reference image is not fatal; the provider proceeds without it
    }
  }

  try {
    const handle = await provider.createJob(input);
    await prisma.job.update({ where: { id: jobId }, data: { providerRef: handle.providerRef } });

    await provider.awaitCompletion(handle, input, {
      timeoutMs: envInt('PROVIDER_TIMEOUT_MS', 900_000),
      signal: ctx.signal,
      onProgress: (p) => void updateProgress(jobId, p),
    });

    const art = await provider.collectArtifacts(handle, input);

    const base = `videos/${job.userId}/${jobId}`;
    const mp4Key = `${base}/output.mp4`;
    const thumbKey = `${base}/thumbnail.jpg`;
    await storage.putFile(mp4Key, art.mp4Path, 'video/mp4');
    await storage.putFile(thumbKey, art.thumbPath, 'image/jpeg');

    await prisma.$transaction([
      prisma.video.create({
        data: {
          jobId,
          userId: job.userId,
          storageKeyMp4: mp4Key,
          storageKeyThumb: thumbKey,
          durationSec: art.durationSec,
          width: art.width,
          height: art.height,
          sizeBytes: art.mp4Bytes,
        },
      }),
      prisma.job.update({
        where: { id: jobId },
        data: { status: 'succeeded', progress: 100, finishedAt: new Date(), error: null },
      }),
    ]);

    console.log(`[worker] job ${jobId} succeeded`);
  } catch (err) {
    const isCancel = err instanceof ProviderError && err.kind === 'canceled';

    // Graceful shutdown: put the job back on the queue rather than failing it. Credits stay
    // reserved; the next worker start picks it up.
    if (isCancel && ctx.isShuttingDown()) {
      await prisma.job.updateMany({
        where: { id: jobId, status: 'running' },
        data: { status: 'queued', startedAt: null, providerRef: null, progress: 0 },
      });
      console.log(`[worker] job ${jobId} re-queued for graceful shutdown`);
      return;
    }

    // Otherwise it is a real failure (or a user cancel — Slice 6): mark failed + refund.
    const userMessage =
      err instanceof ProviderError
        ? err.userSafeMessage
        : 'Generation failed. Your credits have been refunded.';
    const providerLog = err instanceof Error ? `${err.name}: ${err.message}` : String(err);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: userMessage,
        providerLog,
        finishedAt: new Date(),
      },
    });
    await refundJob(prisma, job, 'job_refund');
    console.log(`[worker] job ${jobId} failed and refunded: ${providerLog}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
