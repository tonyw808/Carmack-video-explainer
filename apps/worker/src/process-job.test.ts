// End-to-end worker tests against an isolated DB + temp local storage + MockProvider.
// Covers the happy path (video persisted, credit spent) and the failure path (job failed
// with a user-safe message, credits auto-refunded, refund idempotent), plus cancel-during-
// generation (artifacts discarded, refunded once).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestDb, type TestDb } from '@reelforge/db/test-utils';
import {
  cancelJob,
  createJobWithReservation,
  creditPurchase,
  getBalance,
} from '@reelforge/db';
import { createLocalStorage } from '@reelforge/storage';
import { MockProvider } from '@reelforge/video-provider';
import { serializeJobParams, type JobParams } from '@reelforge/core';
import { processJob } from './process-job';

let db: TestDb;
let storageDir: string;

const PARAMS: JobParams = { durationSec: 5, aspectRatio: '16:9', stylePreset: 'cinematic' };
const ctx = { signal: new AbortController().signal, isShuttingDown: () => false };

function deps(provider: MockProvider) {
  return { prisma: db.client, storage: createLocalStorage(storageDir), provider };
}

async function seedUserWithCredits(credits: number): Promise<string> {
  const user = await db.client.user.create({ data: { email: `u-${Math.random().toString(36).slice(2)}@t.co` } });
  await creditPurchase(db.client, { userId: user.id, amount: credits, reason: 'purchase', reference: `seed_${user.id}` });
  return user.id;
}

async function makeJob(userId: string, opts: { prompt?: string; cost?: number } = {}) {
  return createJobWithReservation(db.client, {
    userId,
    prompt: opts.prompt ?? 'a serene lake',
    paramsJson: serializeJobParams(PARAMS),
    costCredits: opts.cost ?? 30,
    providerName: 'mock',
  });
}

beforeEach(() => {
  db = createTestDb();
  storageDir = mkdtempSync(path.join(tmpdir(), 'reelforge-wstore-'));
});
afterEach(async () => {
  await db.disconnect();
  rmSync(storageDir, { recursive: true, force: true });
});

describe('processJob', () => {
  it('happy path: stores a video, marks succeeded, spends credits', async () => {
    const userId = await seedUserWithCredits(100);
    const job = await makeJob(userId);
    expect(await getBalance(db.client, userId)).toBe(70); // reserved on create

    const provider = new MockProvider({ minMs: 5, maxMs: 10, failureRate: 0 });
    await processJob(job.id, ctx, deps(provider));

    const updated = await db.client.job.findUniqueOrThrow({ where: { id: job.id }, include: { video: true } });
    expect(updated.status).toBe('succeeded');
    expect(updated.progress).toBe(100);
    expect(updated.finishedAt).not.toBeNull();
    expect(updated.video).not.toBeNull();
    expect(updated.video!.sizeBytes).toBeGreaterThan(1000);

    // storage actually has the objects
    const storage = createLocalStorage(storageDir);
    expect(await storage.exists(updated.video!.storageKeyMp4)).toBe(true);
    expect(await storage.exists(updated.video!.storageKeyThumb)).toBe(true);

    expect(await getBalance(db.client, userId)).toBe(70); // spent, no refund
  });

  it('failure path: marks failed with a user-safe message and auto-refunds', async () => {
    const userId = await seedUserWithCredits(100);
    const job = await makeJob(userId, { prompt: 'break it [force-fail]' });
    expect(await getBalance(db.client, userId)).toBe(70);

    const provider = new MockProvider({ minMs: 5, maxMs: 10, failureRate: 0 });
    await processJob(job.id, ctx, deps(provider));

    const updated = await db.client.job.findUniqueOrThrow({ where: { id: job.id }, include: { video: true } });
    expect(updated.status).toBe('failed');
    expect(updated.error).toMatch(/refunded/i);
    expect(updated.error).not.toMatch(/force-fail|stack|Error:/); // user-safe, no internals
    expect(updated.providerLog).toContain('ProviderError'); // raw detail kept separately
    expect(updated.video).toBeNull();
    expect(await getBalance(db.client, userId)).toBe(100); // fully refunded
  });

  it('refund is idempotent: reprocessing a failed job does not double-refund', async () => {
    const userId = await seedUserWithCredits(100);
    const job = await makeJob(userId, { prompt: '[force-fail]' });
    const provider = new MockProvider({ minMs: 5, maxMs: 10, failureRate: 0 });

    await processJob(job.id, ctx, deps(provider));
    await processJob(job.id, ctx, deps(provider)); // second delivery — must be a no-op
    expect(await getBalance(db.client, userId)).toBe(100);
    const rows = await db.client.creditLedgerEntry.findMany({ where: { userId, reason: 'job_refund' } });
    expect(rows).toHaveLength(1);
  });

  it('cancel during generation: discards artifacts, stays canceled, refunds once', async () => {
    const userId = await seedUserWithCredits(100);
    const job = await makeJob(userId);
    // Slow provider so we can cancel mid-flight; progress ticks every 250ms detect the cancel.
    const provider = new MockProvider({ minMs: 900, maxMs: 900, failureRate: 0 });

    const running = processJob(job.id, ctx, deps(provider));
    await new Promise((r) => setTimeout(r, 120));
    await cancelJob(db.client, job); // API-side cancel + refund
    await running;

    const updated = await db.client.job.findUniqueOrThrow({ where: { id: job.id }, include: { video: true } });
    expect(updated.status).toBe('canceled');
    expect(updated.video).toBeNull();
    expect(await getBalance(db.client, userId)).toBe(100); // reserved 30 then refunded
    const refunds = await db.client.creditLedgerEntry.findMany({ where: { userId, reason: 'job_cancel_refund' } });
    expect(refunds).toHaveLength(1);
  });

  it('timeout: a provider that exceeds the deadline fails and refunds', async () => {
    const userId = await seedUserWithCredits(100);
    const job = await makeJob(userId);
    process.env.PROVIDER_TIMEOUT_MS = '150';
    const provider = new MockProvider({ minMs: 5000, maxMs: 5000, failureRate: 0 });
    await processJob(job.id, ctx, deps(provider));
    delete process.env.PROVIDER_TIMEOUT_MS;

    const updated = await db.client.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('failed');
    expect(updated.error).toMatch(/timed out|refunded/i);
    expect(await getBalance(db.client, userId)).toBe(100);
  });
});
