// BullMQ + Redis queue (production). bullmq/ioredis are imported dynamically so they are
// never loaded unless QUEUE_DRIVER=bullmq. Redis IS runnable in this sandbox, so this
// driver is integration-tested against a local redis-server (see bullmq.integration.test.ts,
// gated on REDIS_URL).
import type { ConsumeOptions, JobHandler, QueueDriver } from './types';

// Structural types so this file typechecks without bullmq/ioredis present at check time.
type QueueLike = {
  add: (name: string, data: unknown, opts?: unknown) => Promise<unknown>;
  close: () => Promise<void>;
};
type WorkerLike = {
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  close: () => Promise<void>;
};

export interface BullmqOptions {
  redisUrl: string;
  queueName?: string;
}

export class BullmqQueueDriver implements QueueDriver {
  readonly name = 'bullmq';
  private readonly redisUrl: string;
  private readonly queueName: string;
  private queueInstance?: QueueLike;
  private connections: Array<{ quit: () => Promise<unknown> }> = [];

  constructor(opts: BullmqOptions) {
    this.redisUrl = opts.redisUrl;
    this.queueName = opts.queueName ?? 'reelforge-jobs';
  }

  private async newConnection() {
    const { default: IORedis } = await import('ioredis');
    // BullMQ requires maxRetriesPerRequest: null on its blocking connections.
    const conn = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.connections.push(conn as unknown as { quit: () => Promise<unknown> });
    return conn;
  }

  private async queue(): Promise<QueueLike> {
    if (!this.queueInstance) {
      const { Queue } = await import('bullmq');
      const connection = await this.newConnection();
      this.queueInstance = new Queue(this.queueName, { connection }) as unknown as QueueLike;
    }
    return this.queueInstance;
  }

  async enqueue(jobId: string): Promise<void> {
    const queue = await this.queue();
    // jobId as the BullMQ id dedups repeated enqueues of the same job.
    await queue.add('generate', { jobId }, { jobId, removeOnComplete: true, removeOnFail: 500 });
  }

  async consume(handler: JobHandler, opts: ConsumeOptions): Promise<void> {
    const { Worker } = await import('bullmq');
    const connection = await this.newConnection();
    const worker = new Worker(
      this.queueName,
      async (job: { data: { jobId: string } }) => {
        await handler(job.data.jobId);
      },
      { connection, concurrency: opts.concurrency }
    ) as unknown as WorkerLike;

    worker.on('failed', (job: unknown, err: unknown) => {
      const jobId = (job as { data?: { jobId?: string } })?.data?.jobId;
      if (jobId) opts.onError?.(jobId, err);
    });

    await new Promise<void>((resolve) => {
      if (opts.signal.aborted) return resolve();
      opts.signal.addEventListener('abort', () => resolve(), { once: true });
    });

    await worker.close(); // graceful: waits for active jobs to finish
  }

  async close(): Promise<void> {
    await this.queueInstance?.close();
    await Promise.all(this.connections.map((c) => c.quit().catch(() => {})));
    this.connections = [];
    this.queueInstance = undefined;
  }
}
