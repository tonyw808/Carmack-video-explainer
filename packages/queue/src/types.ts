/** Invoked once per successful, exclusive claim of a job id. */
export type JobHandler = (jobId: string) => Promise<void>;

export interface ConsumeOptions {
  /** Max jobs processed concurrently by this consumer. */
  concurrency: number;
  /** Abort to stop consuming; consume() resolves after in-flight jobs drain. */
  signal: AbortSignal;
  /** Called when a handler throws (the handler itself owns job-failure persistence). */
  onError?: (jobId: string, err: unknown) => void;
}

/**
 * Delivery transport for job ids. Implementations guarantee that a given job id is handed
 * to at most one consumer at a time (exclusive claim) and survive restarts as their backing
 * store allows. The job's authoritative state always lives in the jobs table; the queue is
 * only a wakeup + claim mechanism.
 */
export interface QueueDriver {
  readonly name: string;
  /** Announce that a job (already persisted as queued) is ready to process. */
  enqueue(jobId: string): Promise<void>;
  /** Consume until the signal aborts. Resolves once in-flight work has drained. */
  consume(handler: JobHandler, opts: ConsumeOptions): Promise<void>;
  /** Release resources (connections, timers). */
  close(): Promise<void>;
}
