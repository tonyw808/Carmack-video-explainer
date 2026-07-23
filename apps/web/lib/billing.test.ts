import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '@reelforge/db/test-utils';
import { getBalance } from '@reelforge/db';
import { DEFAULT_PACKS, DEFAULT_PRICING, findPackOrThrow } from '@reelforge/core';
import {
  buildCheckoutCompletedEvent,
  handleStripeEvent,
  signStripePayload,
  startCheckout,
  verifyStripeSignature,
  SignatureError,
} from './billing';

const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_fixture_secret';
const STARTER = findPackOrThrow(DEFAULT_PACKS, 'starter'); // { credits: 100, priceCents: 500 }

let db: TestDb;

async function seedPacks() {
  await db.client.priceConfig.create({ data: { key: 'packs', valueJson: JSON.stringify(DEFAULT_PACKS) } });
  await db.client.priceConfig.create({ data: { key: 'pricing', valueJson: JSON.stringify(DEFAULT_PRICING) } });
}

async function makeUser(): Promise<string> {
  const u = await db.client.user.create({
    data: { email: `u-${Math.random().toString(36).slice(2)}@t.co` },
  });
  return u.id;
}

function signedEvent(userId: string, packId: string, priceCents: number, eventId?: string) {
  const { id, rawBody } = buildCheckoutCompletedEvent({ userId, packId, priceCents, eventId });
  return { id, rawBody, header: signStripePayload(rawBody, SECRET) };
}

beforeEach(async () => {
  db = createTestDb();
  await seedPacks();
});
afterEach(async () => {
  await db.disconnect();
});

describe('stripe signature', () => {
  it('round-trips a signed payload', () => {
    const body = JSON.stringify({ hello: 'world' });
    expect(() => verifyStripeSignature(body, signStripePayload(body, SECRET), SECRET)).not.toThrow();
  });

  it('rejects a tampered body', () => {
    const header = signStripePayload('{"a":1}', SECRET);
    expect(() => verifyStripeSignature('{"a":2}', header, SECRET)).toThrow(SignatureError);
  });

  it('rejects a wrong secret', () => {
    const header = signStripePayload('{"a":1}', SECRET);
    expect(() => verifyStripeSignature('{"a":1}', header, 'whsec_wrong')).toThrow(SignatureError);
  });

  it('rejects a stale timestamp', () => {
    const old = Math.floor(Date.now() / 1000) - 10_000;
    const header = signStripePayload('{"a":1}', SECRET, old);
    expect(() => verifyStripeSignature('{"a":1}', header, SECRET)).toThrow(SignatureError);
  });

  it('rejects a missing header', () => {
    expect(() => verifyStripeSignature('{}', null, SECRET)).toThrow(SignatureError);
  });
});

describe('handleStripeEvent', () => {
  it('credits the user on a valid checkout.session.completed', async () => {
    const userId = await makeUser();
    const { rawBody, header } = signedEvent(userId, STARTER.id, STARTER.priceCents);
    const res = await handleStripeEvent(rawBody, header, db.client);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ credited: STARTER.credits });
    expect(await getBalance(db.client, userId)).toBe(STARTER.credits);
  });

  it('rejects an event with an invalid signature (no credit)', async () => {
    const userId = await makeUser();
    const { rawBody } = signedEvent(userId, STARTER.id, STARTER.priceCents);
    const res = await handleStripeEvent(rawBody, 't=1,v1=deadbeef', db.client);
    expect(res.status).toBe(400);
    expect(await getBalance(db.client, userId)).toBe(0);
  });

  it('is idempotent across duplicate deliveries of the same event id', async () => {
    const userId = await makeUser();
    const { rawBody, header } = signedEvent(userId, STARTER.id, STARTER.priceCents, 'evt_dup_1');
    const first = await handleStripeEvent(rawBody, header, db.client);
    const second = await handleStripeEvent(rawBody, header, db.client);
    expect(first.body).toMatchObject({ credited: STARTER.credits });
    expect(second.body).toMatchObject({ idempotent: true });
    expect(await getBalance(db.client, userId)).toBe(STARTER.credits); // credited once
  });

  it('derives credits from the pack, not the event amount (anti-tamper)', async () => {
    const userId = await makeUser();
    // build an event whose amount claims a huge value; credits must still come from the pack
    const { rawBody, header } = signedEvent(userId, STARTER.id, 9_999_999);
    await handleStripeEvent(rawBody, header, db.client);
    expect(await getBalance(db.client, userId)).toBe(STARTER.credits);
  });

  it('rejects an unknown pack', async () => {
    const userId = await makeUser();
    const { rawBody, header } = signedEvent(userId, 'no_such_pack', 500);
    const res = await handleStripeEvent(rawBody, header, db.client);
    expect(res.status).toBe(400);
    expect(await getBalance(db.client, userId)).toBe(0);
  });

  it('ignores an unhandled event type but records it', async () => {
    const body = JSON.stringify({ id: 'evt_other', type: 'payment_intent.created', data: { object: {} } });
    const res = await handleStripeEvent(body, signStripePayload(body, SECRET), db.client);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ignored: 'payment_intent.created' });
    expect(await db.client.stripeEvent.findUnique({ where: { id: 'evt_other' } })).not.toBeNull();
  });
});

describe('startCheckout (dev fake-checkout)', () => {
  it('credits via the real handler and returns a bounce-back URL', async () => {
    const userId = await makeUser();
    const result = await startCheckout({ id: userId }, STARTER.id, db.client);
    expect(result.mode).toBe('dev-fake');
    expect(result.redirectUrl).toContain('/billing?purchased=');
    expect(await getBalance(db.client, userId)).toBe(STARTER.credits);
  });

  it('throws on an unknown pack', async () => {
    const userId = await makeUser();
    await expect(startCheckout({ id: userId }, 'nope', db.client)).rejects.toThrow();
  });
});
