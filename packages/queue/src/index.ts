import { prisma, type PrismaClient } from '@reelforge/db';
import { loadRootEnv } from '@reelforge/core/env';
import { DbQueueDriver } from './db';
import { MemoryQueueDriver } from './memory';
import { BullmqQueueDriver } from './bullmq';
import type { QueueDriver } from './types';

export type { QueueDriver, JobHandler, ConsumeOptions } from './types';
export { MemoryQueueDriver } from './memory';
export { DbQueueDriver } from './db';
export { BullmqQueueDriver } from './bullmq';

let singleton: QueueDriver | undefined;

/** Build the queue driver selected by QUEUE_DRIVER (default db). Memoized. */
export function getQueue(client: PrismaClient = prisma): QueueDriver {
  if (singleton) return singleton;
  loadRootEnv();
  const driver = process.env.QUEUE_DRIVER ?? 'db';
  if (driver === 'memory') {
    singleton = new MemoryQueueDriver();
  } else if (driver === 'bullmq') {
    singleton = new BullmqQueueDriver({
      redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    });
  } else {
    singleton = new DbQueueDriver(client);
  }
  return singleton;
}

export function resetQueueForTests(): void {
  singleton = undefined;
}
