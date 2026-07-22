// Job lifecycle operations that touch both the ledger and the jobs table, kept transactional
// so a job never exists without its credit reservation (and vice versa).
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/client/index.js';
import type { Job, PrismaClient } from '../generated/client/index.js';
import { debitAndCheckFloor, refundCredits, withWriteRetry } from './credits';

export interface CreateJobInput {
  userId: string;
  prompt: string;
  /** Pre-serialized JobParams JSON (see @reelforge/core serializeJobParams). */
  paramsJson: string;
  costCredits: number;
  providerName: string;
}

/**
 * Atomically reserve credits and create the job as 'queued'. The debit (reason job_reserve,
 * reference = the new job id) and the job row are written in one serializable transaction,
 * so an enqueue either fully happens or not at all. Throws InsufficientCreditsError if the
 * balance floor would be breached (nothing is written). Caller enqueues afterward.
 */
export async function createJobWithReservation(
  client: PrismaClient,
  input: CreateJobInput
): Promise<Job> {
  const jobId = `job_${randomUUID().replace(/-/g, '')}`;
  return withWriteRetry(() =>
    client.$transaction(
      async (tx) => {
        if (input.costCredits > 0) {
          await debitAndCheckFloor(tx, {
            userId: input.userId,
            amount: input.costCredits,
            reason: 'job_reserve',
            reference: jobId,
            note: 'Video generation',
          });
        }
        return tx.job.create({
          data: {
            id: jobId,
            userId: input.userId,
            status: 'queued',
            prompt: input.prompt,
            paramsJson: input.paramsJson,
            costCredits: input.costCredits,
            providerName: input.providerName,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000, maxWait: 15000 }
    )
  );
}

/** Count a user's job submissions in the last windowMs (for rate limiting). */
export async function recentJobCount(
  client: PrismaClient,
  userId: string,
  windowMs: number
): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  return client.job.count({ where: { userId, createdAt: { gte: since } } });
}

/** Idempotently refund a job's reserved credits (failure or cancel). No-op if already done. */
export async function refundJob(
  client: PrismaClient,
  job: Pick<Job, 'id' | 'userId' | 'costCredits'>,
  reason: 'job_refund' | 'job_cancel_refund' | 'manual_refund'
): Promise<void> {
  if (job.costCredits <= 0) return;
  await refundCredits(client, {
    userId: job.userId,
    amount: job.costCredits,
    reason,
    reference: `${reason}:${job.id}`,
    note: 'Automatic refund',
  });
}

/**
 * Cancel a job that is queued or running: atomically flip to canceled (so the worker cannot
 * simultaneously commit success) and refund. The worker detects the status change on its
 * next progress write and aborts the provider; its success-commit is guarded on status
 * 'running', so a cancel that races generation still wins. Returns 'canceled', or
 * 'already_terminal' if the job already finished.
 */
export async function cancelJob(
  client: PrismaClient,
  job: Pick<Job, 'id' | 'userId' | 'costCredits'>
): Promise<'canceled' | 'already_terminal'> {
  const flipped = await client.job.updateMany({
    where: { id: job.id, status: { in: ['queued', 'running'] } },
    data: { status: 'canceled', finishedAt: new Date(), error: 'Canceled by user.' },
  });
  if (flipped.count !== 1) return 'already_terminal';
  await refundJob(client, job, 'job_cancel_refund');
  return 'canceled';
}
