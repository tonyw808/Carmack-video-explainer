import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './test-utils';
import {
  adjustCredits,
  creditPurchase,
  getBalance,
  InsufficientCreditsError,
  refundCredits,
  reserveCredits,
} from './credits';

let db: TestDb;

async function makeUser(email = `u-${Math.random().toString(36).slice(2)}@t.co`): Promise<string> {
  const u = await db.client.user.create({ data: { email } });
  return u.id;
}

/** The core invariant: stored balance must equal the raw sum of every delta. */
async function assertLedgerSumsToBalance(userId: string): Promise<number> {
  const rows = await db.client.creditLedgerEntry.findMany({ where: { userId } });
  const rawSum = rows.reduce((acc, r) => acc + r.delta, 0);
  const balance = await getBalance(db.client, userId);
  expect(balance).toBe(rawSum);
  return balance;
}

beforeEach(() => {
  db = createTestDb();
});
afterEach(async () => {
  await db.disconnect();
});

describe('credit ledger', () => {
  it('starts at zero balance', async () => {
    const userId = await makeUser();
    expect(await getBalance(db.client, userId)).toBe(0);
  });

  it('credits a purchase and refunds and adjusts, summing exactly', async () => {
    const userId = await makeUser();
    await creditPurchase(db.client, { userId, amount: 100, reason: 'purchase', reference: 'evt_1' });
    await reserveCredits(db.client, { userId, amount: 30, reason: 'job_reserve', reference: 'job_1' });
    await refundCredits(db.client, { userId, amount: 30, reason: 'job_refund', reference: 'job_1' });
    await adjustCredits(db.client, { userId, delta: -5, reason: 'admin_adjust', reference: 'adj_1' });
    const balance = await assertLedgerSumsToBalance(userId);
    expect(balance).toBe(95); // 100 - 30 + 30 - 5
  });

  it('refuses to overdraw and rolls the debit back', async () => {
    const userId = await makeUser();
    await creditPurchase(db.client, { userId, amount: 20, reason: 'purchase', reference: 'evt_2' });
    await expect(
      reserveCredits(db.client, { userId, amount: 50, reason: 'job_reserve', reference: 'job_x' })
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    // no debit row was persisted
    const rows = await db.client.creditLedgerEntry.findMany({ where: { userId, reason: 'job_reserve' } });
    expect(rows).toHaveLength(0);
    expect(await getBalance(db.client, userId)).toBe(20);
  });

  it('allows spending exactly to zero', async () => {
    const userId = await makeUser();
    await creditPurchase(db.client, { userId, amount: 40, reason: 'purchase', reference: 'evt_3' });
    const res = await reserveCredits(db.client, { userId, amount: 40, reason: 'job_reserve', reference: 'job_z' });
    expect(res.balance).toBe(0);
    await assertLedgerSumsToBalance(userId);
  });

  describe('idempotency (unique reason+reference)', () => {
    it('purchase is idempotent across duplicate references', async () => {
      const userId = await makeUser();
      const a = await creditPurchase(db.client, { userId, amount: 100, reason: 'purchase', reference: 'evt_dup' });
      const b = await creditPurchase(db.client, { userId, amount: 100, reason: 'purchase', reference: 'evt_dup' });
      expect(a.alreadyApplied).toBe(false);
      expect(b.alreadyApplied).toBe(true);
      expect(await getBalance(db.client, userId)).toBe(100); // not 200
    });

    it('reserve is idempotent (retry does not double-debit)', async () => {
      const userId = await makeUser();
      await creditPurchase(db.client, { userId, amount: 100, reason: 'purchase', reference: 'evt_4' });
      const a = await reserveCredits(db.client, { userId, amount: 30, reason: 'job_reserve', reference: 'job_r' });
      const b = await reserveCredits(db.client, { userId, amount: 30, reason: 'job_reserve', reference: 'job_r' });
      expect(a.alreadyApplied).toBe(false);
      expect(b.alreadyApplied).toBe(true);
      expect(await getBalance(db.client, userId)).toBe(70); // debited once
    });

    it('refund is idempotent (double failure handling is a no-op)', async () => {
      const userId = await makeUser();
      await creditPurchase(db.client, { userId, amount: 100, reason: 'purchase', reference: 'evt_5' });
      await reserveCredits(db.client, { userId, amount: 30, reason: 'job_reserve', reference: 'job_f' });
      const a = await refundCredits(db.client, { userId, amount: 30, reason: 'job_refund', reference: 'job_f' });
      const b = await refundCredits(db.client, { userId, amount: 30, reason: 'job_refund', reference: 'job_f' });
      expect(a.alreadyApplied).toBe(false);
      expect(b.alreadyApplied).toBe(true);
      expect(await getBalance(db.client, userId)).toBe(100); // refunded once
    });
  });

  describe('concurrency', () => {
    it('never overdraws under a burst of concurrent reserves', async () => {
      const userId = await makeUser();
      await creditPurchase(db.client, { userId, amount: 100, reason: 'purchase', reference: 'evt_burst' });

      // Fire 10 reserves of 30 concurrently. At most floor(100/30)=3 may succeed.
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          reserveCredits(db.client, {
            userId,
            amount: 30,
            reason: 'job_reserve',
            reference: `burst_${i}`,
          })
        )
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter(
        (r) => r.status === 'rejected' && r.reason instanceof InsufficientCreditsError
      ).length;

      expect(succeeded).toBe(3);
      expect(rejected).toBe(7);

      const balance = await assertLedgerSumsToBalance(userId);
      expect(balance).toBe(10); // 100 - 3*30
      expect(balance).toBeGreaterThanOrEqual(0);
    });
  });

  it('rejects non-positive amounts', async () => {
    const userId = await makeUser();
    await expect(
      creditPurchase(db.client, { userId, amount: 0, reason: 'purchase', reference: 'z' })
    ).rejects.toThrow();
    await expect(
      reserveCredits(db.client, { userId, amount: -5, reason: 'job_reserve', reference: 'z' })
    ).rejects.toThrow();
  });
});
