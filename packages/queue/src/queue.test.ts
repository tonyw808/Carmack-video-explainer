import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '@reelforge/db/test-utils';
import { MemoryQueueDriver } from './memory';
import { DbQueueDriver } from './db';

describe('MemoryQueueDriver', () => {
  it('delivers each enqueued id exactly once, honoring concurrency', async () => {
    const q = new MemoryQueueDriver();
    for (let i = 0; i < 20; i++) await q.enqueue(`job_${i}`);

    const seen: string[] = [];
    let active = 0;
    let maxActive = 0;
    const ac = new AbortController();

    const consuming = q.consume(
      async (jobId) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        seen.push(jobId);
        active--;
        if (seen.length === 20) ac.abort();
      },
      { concurrency: 4, signal: ac.signal }
    );
    await consuming;

    expect(seen.sort()).toEqual(Array.from({ length: 20 }, (_, i) => `job_${i}`).sort());
    expect(new Set(seen).size).toBe(20); // no duplicates
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it('reports handler errors via onError and keeps going', async () => {
    const q = new MemoryQueueDriver();
    await q.enqueue('bad');
    await q.enqueue('good');
    const errors: string[] = [];
    const done: string[] = [];
    const ac = new AbortController();
    await q.consume(
      async (jobId) => {
        if (jobId === 'bad') throw new Error('boom');
        done.push(jobId);
        ac.abort();
      },
      { concurrency: 1, signal: ac.signal, onError: (jobId) => errors.push(jobId) }
    );
    expect(errors).toContain('bad');
    expect(done).toContain('good');
  });
});

describe('DbQueueDriver', () => {
  let db: TestDb;
  beforeEach(() => {
    db = createTestDb();
  });
  afterEach(async () => {
    await db.disconnect();
  });

  async function seedJob(id: string, userId: string) {
    await db.client.job.create({
      data: {
        id,
        userId,
        status: 'queued',
        prompt: 'p',
        paramsJson: '{}',
        costCredits: 10,
        providerName: 'mock',
      },
    });
  }

  it('claims each queued job exactly once across concurrent consumers', async () => {
    const user = await db.client.user.create({ data: { email: 'q@t.co' } });
    for (let i = 0; i < 12; i++) await seedJob(`j_${i}`, user.id);

    const q = new DbQueueDriver(db.client);
    const claimed: string[] = [];
    const ac = new AbortController();

    // Two independent consumers competing for the same table.
    const consumer = () =>
      q.consume(
        async (jobId) => {
          claimed.push(jobId);
          await db.client.job.update({ where: { id: jobId }, data: { status: 'succeeded' } });
          if (claimed.length === 12) ac.abort();
        },
        { concurrency: 2, signal: ac.signal }
      );
    await Promise.all([consumer(), consumer()]);

    expect(claimed.length).toBe(12);
    expect(new Set(claimed).size).toBe(12); // exclusivity: no job claimed twice
    const remaining = await db.client.job.count({ where: { status: 'queued' } });
    expect(remaining).toBe(0);
  });

  it('returns null when nothing is queued', async () => {
    const q = new DbQueueDriver(db.client);
    expect(await q.claimNext()).toBeNull();
  });

  it('marks a claimed job running with startedAt and attempts', async () => {
    const user = await db.client.user.create({ data: { email: 'q2@t.co' } });
    await seedJob('solo', user.id);
    const q = new DbQueueDriver(db.client);
    const id = await q.claimNext();
    expect(id).toBe('solo');
    const job = await db.client.job.findUniqueOrThrow({ where: { id: 'solo' } });
    expect(job.status).toBe('running');
    expect(job.startedAt).not.toBeNull();
    expect(job.attempts).toBe(1);
    expect(await q.claimNext()).toBeNull(); // not re-claimable
  });
});
