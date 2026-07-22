// Reelforge worker entrypoint. Slice 1 stub: proves the process topology and env
// loading; the real claim loop + provider orchestration lands in Slice 4.
import { loadRootEnv } from '@reelforge/core/env';
import { prisma } from '@reelforge/db';

loadRootEnv();

let stopping = false;

async function main() {
  console.log('[worker] started (stub) — queue driver:', process.env.QUEUE_DRIVER);
  await prisma.$queryRaw`SELECT 1`;
  console.log('[worker] database reachable');

  const tick = setInterval(() => {
    if (stopping) clearInterval(tick);
  }, 1000);

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} received — shutting down`);
    clearInterval(tick);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
