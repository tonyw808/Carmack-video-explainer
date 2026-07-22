// Processes a single claimed job end-to-end: run the provider, store artifacts, persist the
// video, and mark terminal status. Handles three non-success exits:
//   - provider failure  → mark failed with a user-safe message + idempotent refund
//   - graceful shutdown → re-queue the in-flight job (credits stay reserved)
//   - user cancel       → the API already set canceled + refunded; discard any artifacts
// Dependencies are injectable so the worker can be tested against an isolated database.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma as defaultPrisma, refundJob, type PrismaClient } from '@reelforge/db';
import { getStorage, type StorageDriver } from '@reelforge/storage';
import {
  getVideoProvider,
  ProviderError,
  type ProviderJobInput,
  type VideoProvider,
} from '@reelforge/video-provider';
import { parseJobParams, repoRootPath } from '@reelforge/core';
import { envInt } from '@reelforge/core/env';

function workRoot(): string {
  const configured = process.env.WORK_ROOT ?? '.data/work';
  return path.isAbsolute(configured) ? configured : path.resolve(repoRootPath(), configured);
}

export interface ProcessDeps {
  prisma: PrismaClient;
  storage: StorageDriver;
  provider: VideoProvider;
}

export interface ProcessContext {
  /** Aborted on graceful shutdown. */
  signal: AbortSignal;
  /** True while the worker is shutting down (distinguishes re-queue from user cancel). */
  isShuttingDown: () => boolean;
}

function resolveDeps(partial?: Partial<ProcessDeps>): ProcessDeps {
  return {
    prisma: partial?.prisma ?? defaultPrisma,
    storage: partial?.storage ?? getStorage(),
    provider: partial?.provider ?? getVideoProvider(),
  };
}

export async function processJob(
  jobId: string,
  ctx: ProcessContext,
  depsPartial?: Partial<ProcessDeps>
): Promise<void> {
  const { prisma, storage, provider } = resolveDeps(depsPartial);

  // Idempotently ensure the job is 'running' (the db driver already claimed it; other
  // drivers deliver a still-'queued' row). Only a queued→running transition sets timing.
  await prisma.job.updateMany({
    where: { id: jobId, status: 'queued' },
    data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
  });

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.status !== 'running') return; // canceled while queued, or already terminal

  const params = parseJobParams(job.paramsJson);
  const dir = path.join(workRoot(), jobId);
  await mkdir(dir, { recursive: true });

  const input: ProviderJobInput = { jobId, prompt: job.prompt, params, workDir: dir };

  if (params.referenceImageKey) {
    try {
      const bytes = await storage.get(params.referenceImageKey);
      const refPath = path.join(dir, 'reference' + path.extname(params.referenceImageKey));
      await writeFile(refPath, bytes);
      input.referenceImagePath = refPath;
    } catch {
      // a missing reference image is not fatal; proceed without it
    }
  }

  // Per-job abort: fires on graceful shutdown OR when a cancel is detected mid-run.
  const jobAc = new AbortController();
  const onShutdown = () => jobAc.abort();
  ctx.signal.addEventListener('abort', onShutdown, { once: true });

  try {
    const handle = await provider.createJob(input);
    await prisma.job.update({ where: { id: jobId }, data: { providerRef: handle.providerRef } });

    await provider.awaitCompletion(handle, input, {
      timeoutMs: envInt('PROVIDER_TIMEOUT_MS', 900_000),
      signal: jobAc.signal,
      onProgress: async (p) => {
        // Persist progress, and if the API flipped the job to 'canceled', abort locally.
        const updated = await prisma.job.updateMany({
          where: { id: jobId, status: 'running' },
          data: { progress: p },
        });
        if (updated.count === 0 && !jobAc.signal.aborted) jobAc.abort();
      },
    });

    const art = await provider.collectArtifacts(handle, input);

    const base = `videos/${job.userId}/${jobId}`;
    const mp4Key = `${base}/output.mp4`;
    const thumbKey = `${base}/thumbnail.jpg`;
    await storage.putFile(mp4Key, art.mp4Path, 'video/mp4');
    await storage.putFile(thumbKey, art.thumbPath, 'image/jpeg');

    // Commit success only if the job is still 'running' (a concurrent cancel wins).
    const committed = await prisma.$transaction(async (tx) => {
      const current = await tx.job.findUnique({ where: { id: jobId } });
      if (current?.status !== 'running') return false;
      await tx.video.create({
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
      });
      await tx.job.update({
        where: { id: jobId },
        data: { status: 'succeeded', progress: 100, finishedAt: new Date(), error: null },
      });
      return true;
    });

    if (committed) {
      console.log(`[worker] job ${jobId} succeeded`);
    } else {
      // Canceled during generation — discard the artifacts we just stored.
      await storage.delete(mp4Key).catch(() => {});
      await storage.delete(thumbKey).catch(() => {});
      console.log(`[worker] job ${jobId} canceled during generation — artifacts discarded`);
    }
  } catch (err) {
    const isCancel = err instanceof ProviderError && err.kind === 'canceled';

    if (isCancel && ctx.isShuttingDown()) {
      // Graceful shutdown: re-queue (only if still running — a user cancel leaves it canceled).
      await prisma.job.updateMany({
        where: { id: jobId, status: 'running' },
        data: { status: 'queued', startedAt: null, providerRef: null, progress: 0 },
      });
      console.log(`[worker] job ${jobId} re-queued for graceful shutdown`);
      return;
    }

    if (isCancel) {
      // User cancel: the API already set canceled + refunded. Nothing to do but clean up.
      console.log(`[worker] job ${jobId} canceled by user`);
      return;
    }

    // Real failure: mark failed with a user-safe message + refund, but only if still running
    // (don't clobber a cancel that raced in).
    const userMessage =
      err instanceof ProviderError
        ? err.userSafeMessage
        : 'Generation failed. Your credits have been refunded.';
    const providerLog = err instanceof Error ? `${err.name}: ${err.message}` : String(err);

    const marked = await prisma.job.updateMany({
      where: { id: jobId, status: 'running' },
      data: { status: 'failed', error: userMessage, providerLog, finishedAt: new Date() },
    });
    if (marked.count === 1) {
      await refundJob(prisma, job, 'job_refund');
      console.log(`[worker] job ${jobId} failed and refunded: ${providerLog}`);
    }
  } finally {
    ctx.signal.removeEventListener('abort', onShutdown);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
