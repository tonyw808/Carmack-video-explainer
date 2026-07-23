// Integration test for the production BullMQ driver against a real Redis. Skipped unless
// REDIS_URL is set (CI/local with redis-server running). In this sandbox we start a local
// redis-server and set REDIS_URL to exercise it — see the queue test run in STATE.md.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullmqQueueDriver } from './bullmq';

const REDIS_URL = process.env.REDIS_URL;
const describeIf = REDIS_URL ? describe : describe.skip;

describeIf('BullmqQueueDriver (requires REDIS_URL)', () => {
  const queueName = `reelforge-test-${Date.now()}`;
  let driver: BullmqQueueDriver;

  beforeAll(async () => {
    driver = new BullmqQueueDriver({ redisUrl: REDIS_URL!, queueName });
    // drain any prior state by using a unique queue name per run
  });
  afterAll(async () => {
    await driver.close();
  });

  it('round-trips enqueued jobs through a worker with concurrency', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `bull_${i}`);
    for (const id of ids) await driver.enqueue(id);

    const seen: string[] = [];
    const ac = new AbortController();
    const consuming = driver.consume(
      async (jobId) => {
        seen.push(jobId);
        if (seen.length === ids.length) ac.abort();
      },
      { concurrency: 3, signal: ac.signal }
    );

    // safety timeout
    const timer = setTimeout(() => ac.abort(), 15000);
    await consuming;
    clearTimeout(timer);

    expect(seen.sort()).toEqual([...ids].sort());
    expect(new Set(seen).size).toBe(ids.length);
  }, 20000);
});
