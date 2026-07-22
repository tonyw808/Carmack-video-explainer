// Reelforge worker: claims queued jobs and orchestrates the video provider. Graceful
// shutdown aborts the shared signal, which stops claiming new work and re-queues any
// in-flight job (see process-job.ts), then drains within WORKER_SHUTDOWN_GRACE_MS.
import { loadRootEnv, envInt } from '@reelforge/core/env';
import { prisma } from '@reelforge/db';
import { getQueue } from '@reelforge/queue';
import { processJob } from './process-job';

loadRootEnv();

const ac = new AbortController();
let shuttingDown = false;

async function main() {
  const queue = getQueue();
  const concurrency = envInt('WORKER_CONCURRENCY', 2);
  const provider = process.env.VIDEO_PROVIDER ?? 'mock';
  console.log(
    `[worker] starting: queue=${queue.name} concurrency=${concurrency} provider=${provider}`
  );
  await prisma.$queryRaw`SELECT 1`;
  console.log('[worker] database reachable — consuming');

  const consuming = queue.consume(
    (jobId) => processJob(jobId, { signal: ac.signal, isShuttingDown: () => shuttingDown }),
    {
      concurrency,
      signal: ac.signal,
      onError: (jobId, err) => console.error(`[worker] unhandled error for job ${jobId}:`, err),
    }
  );

  const shutdown = async (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const grace = envInt('WORKER_SHUTDOWN_GRACE_MS', 20_000);
    console.log(`[worker] ${sig} received — draining (grace ${grace}ms)`);
    ac.abort();
    const timer = setTimeout(() => {
      console.error('[worker] grace period expired — forcing exit');
      process.exit(1);
    }, grace);
    timer.unref();
    try {
      await consuming;
      await queue.close();
      await prisma.$disconnect();
    } catch (err) {
      console.error('[worker] error during shutdown:', err);
    }
    clearTimeout(timer);
    console.log('[worker] shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await consuming;
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
