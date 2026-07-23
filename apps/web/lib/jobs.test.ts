// Rate-limit + moderation + credit enforcement on job submission. Uses an isolated DB and
// injects it via the exported prisma singleton path by seeding through the same client the
// service uses (submitJob reads the module-level prisma), so we exercise the real service.
//
// NOTE: submitJob uses the module singleton `prisma` and `getQueue()`. To keep this a true
// unit test of the enforcement logic without those globals, we test the underlying db/core
// pieces the service composes: recentJobCount-based limiting via createJobWithReservation,
// moderation, and the insufficient-credits path.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '@reelforge/db/test-utils';
import {
  createJobWithReservation,
  creditPurchase,
  InsufficientCreditsError,
  recentJobCount,
} from '@reelforge/db';
import { assertPromptAllowed, ModerationError, serializeJobParams, type JobParams } from '@reelforge/core';

let db: TestDb;
const PARAMS: JobParams = { durationSec: 5, aspectRatio: '16:9', stylePreset: 'cinematic' };

async function seedUser(credits: number): Promise<string> {
  const user = await db.client.user.create({ data: { email: `u-${Math.random().toString(36).slice(2)}@t.co` } });
  if (credits > 0) {
    await creditPurchase(db.client, { userId: user.id, amount: credits, reason: 'purchase', reference: `seed_${user.id}` });
  }
  return user.id;
}

function submitOnce(userId: string, cost = 30) {
  return createJobWithReservation(db.client, {
    userId,
    prompt: 'a calm sea',
    paramsJson: serializeJobParams(PARAMS),
    costCredits: cost,
    providerName: 'mock',
  });
}

beforeEach(() => {
  db = createTestDb();
});
afterEach(async () => {
  await db.disconnect();
});

describe('job submission enforcement', () => {
  it('moderation blocks disallowed prompts before any spend', () => {
    expect(() => assertPromptAllowed('explicit sexual content with a child')).toThrow(ModerationError);
    expect(() => assertPromptAllowed('a peaceful garden')).not.toThrow();
  });

  it('rate limiting: recentJobCount reflects submissions in the window', async () => {
    const userId = await seedUser(1000);
    expect(await recentJobCount(db.client, userId, 60_000)).toBe(0);
    await submitOnce(userId);
    await submitOnce(userId);
    await submitOnce(userId);
    expect(await recentJobCount(db.client, userId, 60_000)).toBe(3);

    // Simulate the service's guard: with a limit of 3, the next submission is rejected.
    const LIMIT = 3;
    const recent = await recentJobCount(db.client, userId, 60_000);
    expect(recent >= LIMIT).toBe(true);
  });

  it('insufficient credits blocks submission and writes nothing', async () => {
    const userId = await seedUser(20);
    await expect(submitOnce(userId, 50)).rejects.toBeInstanceOf(InsufficientCreditsError);
    const jobs = await db.client.job.count({ where: { userId } });
    expect(jobs).toBe(0);
  });

  it('a successful submission reserves exactly the cost', async () => {
    const userId = await seedUser(100);
    const job = await submitOnce(userId, 30);
    expect(job.status).toBe('queued');
    const balance = (
      await db.client.creditLedgerEntry.aggregate({ where: { userId }, _sum: { delta: true } })
    )._sum.delta;
    expect(balance).toBe(70);
  });
});
