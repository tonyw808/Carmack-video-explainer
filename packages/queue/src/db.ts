// Database-backed queue (dev default). The jobs table IS the queue: enqueue is implicit
// (the API persists the job as 'queued'), and a consumer claims the oldest queued row with
// an atomic conditional update so exactly one worker — even across processes — wins it.
// See DECISIONS D4.
import type { PrismaClient } from '@reelforge/db';
import { runPool } from './concurrency';
import type { ConsumeOptions, JobHandler, QueueDriver } from './types';

export class DbQueueDriver implements QueueDriver {
  readonly name = 'db';
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // The job row already exists as 'queued'; nothing to push. Kept for interface symmetry.
  async enqueue(_jobId: string): Promise<void> {}

  /**
   * Atomically claim the oldest queued job: flip queued→running with a guarded updateMany
   * so a concurrent claimer that lost the race sees count 0 and moves on. Returns the
   * claimed id, or null if nothing is queued.
   */
  async claimNext(): Promise<string | null> {
    // A few attempts to skip past rows another worker claims first.
    for (let i = 0; i < 5; i++) {
      const candidate = await this.prisma.job.findFirst({
        where: { status: 'queued' },
        orderBy: { queuedAt: 'asc' },
        select: { id: true },
      });
      if (!candidate) return null;
      const claimed = await this.prisma.job.updateMany({
        where: { id: candidate.id, status: 'queued' },
        data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
      });
      if (claimed.count === 1) return candidate.id;
    }
    return null;
  }

  async consume(handler: JobHandler, opts: ConsumeOptions): Promise<void> {
    await runPool(
      opts.concurrency,
      opts.signal,
      () => this.claimNext(),
      async (jobId) => {
        try {
          await handler(jobId);
        } catch (err) {
          opts.onError?.(jobId, err);
        }
      }
    );
  }

  async close(): Promise<void> {}
}
