// In-process FIFO queue. Delivery is exclusive because each id is shifted off the array
// exactly once. Cannot cross a process boundary, so it is for unit tests (and single-
// process demos) only — see DECISIONS D4.
import { runPool } from './concurrency';
import type { ConsumeOptions, JobHandler, QueueDriver } from './types';

export class MemoryQueueDriver implements QueueDriver {
  readonly name = 'memory';
  private readonly ids: string[] = [];

  async enqueue(jobId: string): Promise<void> {
    this.ids.push(jobId);
  }

  async consume(handler: JobHandler, opts: ConsumeOptions): Promise<void> {
    await runPool(
      opts.concurrency,
      opts.signal,
      async () => this.ids.shift() ?? null,
      async (jobId) => {
        try {
          await handler(jobId);
        } catch (err) {
          opts.onError?.(jobId, err);
        }
      }
    );
  }

  async close(): Promise<void> {
    this.ids.length = 0;
  }

  /** Test helper: number of pending ids. */
  size(): number {
    return this.ids.length;
  }
}
