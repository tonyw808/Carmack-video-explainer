/** A fixed-size worker pool that pulls ids from an async source until the signal aborts. */
export async function runPool(
  poolSize: number,
  signal: AbortSignal,
  next: () => Promise<string | null>,
  run: (jobId: string) => Promise<void>
): Promise<void> {
  async function worker(): Promise<void> {
    while (!signal.aborted) {
      let jobId: string | null;
      try {
        jobId = await next();
      } catch {
        if (signal.aborted) return;
        // transient source error — brief pause, then retry
        await delay(200, signal);
        continue;
      }
      if (jobId === null) {
        if (signal.aborted) return;
        await delay(100, signal);
        continue;
      }
      await run(jobId);
    }
  }
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true }
    );
  });
}
