// The credit ledger. Append-only: a user's balance is exactly SUM(delta) over their
// rows, and that invariant is the whole design. Every movement is one row carrying a
// reason and a reference; the unique (reason, reference) index makes each logical
// movement idempotent (a doubly-delivered webhook or a re-run refund is a no-op).
//
// The only operation that must guard a threshold is the reservation (debit on enqueue):
// it must never let the balance go negative under concurrency. See reserveCredits.
import { Prisma } from '../generated/client/index.js';
import type { PrismaClient } from '../generated/client/index.js';

export type LedgerReason =
  | 'purchase'
  | 'signup_bonus'
  | 'job_reserve'
  | 'job_refund'
  | 'job_cancel_refund'
  | 'manual_refund'
  | 'admin_adjust';

export interface LedgerInput {
  userId: string;
  /** Positive credits. reserveCredits negates it internally. */
  amount: number;
  reason: LedgerReason;
  /** Stable idempotency key within the reason (e.g. a job id or stripe event id). */
  reference: string;
  note?: string;
}

export interface LedgerResult {
  balance: number;
  /** true when this (reason, reference) already existed — no new row was written. */
  alreadyApplied: boolean;
}

export class InsufficientCreditsError extends Error {
  readonly needed: number;
  readonly available: number;
  constructor(needed: number, available: number) {
    super(`Insufficient credits: need ${needed}, have ${available}`);
    this.name = 'InsufficientCreditsError';
    this.needed = needed;
    this.available = available;
  }
}

// A Prisma client or an interactive-transaction client — both expose these delegates.
type TxLike = Pick<PrismaClient, 'creditLedgerEntry'>;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function isWriteConflict(e: unknown): boolean {
  // P2034: transaction write conflict / deadlock (Postgres serialization failure).
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') return true;
  // SQLite surfaces a locked database as an initialization/raw error message.
  const msg = e instanceof Error ? e.message : String(e);
  return /database is locked|SQLITE_BUSY|write conflict|deadlock/i.test(msg);
}

async function sumBalance(tx: TxLike, userId: string): Promise<number> {
  const agg = await tx.creditLedgerEntry.aggregate({
    where: { userId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}

/** Current balance = SUM(delta) for the user. Zero if the user has no ledger rows. */
export async function getBalance(client: TxLike, userId: string): Promise<number> {
  return sumBalance(client, userId);
}

async function withWriteRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isWriteConflict(e)) throw e;
      lastError = e;
      // brief jittered backoff before retrying the whole transaction
      await new Promise((r) => setTimeout(r, 10 * (i + 1) + Math.floor(Math.random() * 10)));
    }
  }
  throw lastError;
}

/**
 * Append a ledger entry with an arbitrary signed delta. Atomic (single insert) and
 * idempotent on (reason, reference). Used for purchases, refunds, and admin adjusts —
 * anything that does NOT need a balance floor. Returns the resulting balance.
 */
async function appendEntry(
  client: PrismaClient,
  input: { userId: string; delta: number; reason: LedgerReason; reference: string; note?: string }
): Promise<LedgerResult> {
  try {
    await client.creditLedgerEntry.create({
      data: {
        userId: input.userId,
        delta: input.delta,
        reason: input.reason,
        reference: input.reference,
        note: input.note,
      },
    });
    return { balance: await getBalance(client, input.userId), alreadyApplied: false };
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { balance: await getBalance(client, input.userId), alreadyApplied: true };
    }
    throw e;
  }
}

/** Credit a purchase (positive). Idempotent per Stripe event / purchase reference. */
export async function creditPurchase(client: PrismaClient, input: LedgerInput): Promise<LedgerResult> {
  assertPositive(input.amount);
  return appendEntry(client, { ...input, delta: input.amount });
}

/** Credit a signup bonus (positive). Idempotent per user. */
export async function creditSignupBonus(client: PrismaClient, input: LedgerInput): Promise<LedgerResult> {
  assertPositive(input.amount);
  return appendEntry(client, { ...input, delta: input.amount });
}

/**
 * Refund a previously reserved amount (positive credit). Idempotent: refunding the same
 * (reason, reference) twice is a no-op, which is exactly what the failure and cancel
 * paths need when they may run more than once.
 */
export async function refundCredits(client: PrismaClient, input: LedgerInput): Promise<LedgerResult> {
  assertPositive(input.amount);
  return appendEntry(client, { ...input, delta: input.amount });
}

/** Admin manual adjustment. delta may be positive or negative; not floored. */
export async function adjustCredits(
  client: PrismaClient,
  input: Omit<LedgerInput, 'amount'> & { delta: number }
): Promise<LedgerResult> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error('adjust delta must be a non-zero integer');
  }
  return appendEntry(client, input);
}

/**
 * Reserve (debit) credits for a job, refusing to let the balance go negative.
 *
 * Correctness under concurrency, on both target databases:
 *  - The insert of the debit row is the FIRST write in the transaction, so on SQLite it
 *    takes the reserved/exclusive lock immediately and concurrent reservers serialize.
 *  - isolationLevel Serializable makes Postgres abort one of two overlapping
 *    read-after-write transactions (retried by withWriteRetry).
 *  - After inserting, we re-sum the balance INCLUDING our own debit; if it is negative we
 *    throw, rolling the debit back. Thus the floor holds even if two reservers race.
 * Idempotent on (reason, reference): a repeated reserve returns the existing balance.
 */
export async function reserveCredits(client: PrismaClient, input: LedgerInput): Promise<LedgerResult> {
  assertPositive(input.amount);
  return withWriteRetry(async () => {
    try {
      return await client.$transaction(
        async (tx) => {
          await tx.creditLedgerEntry.create({
            data: {
              userId: input.userId,
              delta: -input.amount,
              reason: input.reason,
              reference: input.reference,
              note: input.note,
            },
          });
          const balance = await sumBalance(tx, input.userId);
          if (balance < 0) {
            // roll back the debit; report what was actually available beforehand
            throw new InsufficientCreditsError(input.amount, balance + input.amount);
          }
          return { balance, alreadyApplied: false };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000, maxWait: 15000 }
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        return { balance: await getBalance(client, input.userId), alreadyApplied: true };
      }
      throw e;
    }
  });
}

function assertPositive(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('credit amount must be a positive integer');
  }
}
