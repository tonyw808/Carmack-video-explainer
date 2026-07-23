// Stripe credit-pack billing.
//
// Signature handling follows Stripe's documented scheme exactly (t=<ts>,v1=<hmac> where
// the signed payload is `${ts}.${rawBody}` and the mac is HMAC-SHA256 with the endpoint
// secret). Implementing it directly means: (a) the webhook verifier works with zero
// network and accepts REAL Stripe webhooks in production unchanged, and (b) the dev
// fake-checkout can mint correctly-signed events that exercise the identical handler.
//
// Idempotency has two layers: the append-only ledger keyed on reference = event.id
// guarantees credits are never granted twice; the StripeEvent table records processed
// events for audit and a fast skip path.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { creditPurchase, loadPacks, prisma } from '@reelforge/db';
import type { PrismaClient } from '@reelforge/db';
import { envFlag } from '@reelforge/core/env';
import { findPackOrThrow, type CreditPack } from '@reelforge/core';

const HANDLED_EVENT = 'checkout.session.completed';

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  return secret;
}

/** Build the value for a `Stripe-Signature` header over the given raw body. */
export function signStripePayload(rawBody: string, secret: string, timestampSec?: number): string {
  const t = timestampSec ?? Math.floor(Date.now() / 1000);
  const mac = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v1=${mac}`;
}

export class SignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureError';
  }
}

function parseSigHeader(header: string): { t: number; v1: string[] } {
  const parts = header.split(',').map((p) => p.trim());
  let t = NaN;
  const v1: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 't') t = Number(v);
    else if (k === 'v1' && v) v1.push(v);
  }
  return { t, v1 };
}

/** Verify a Stripe-Signature header. Throws SignatureError on any mismatch. */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  toleranceSec = 300
): void {
  if (!header) throw new SignatureError('missing signature header');
  const { t, v1 } = parseSigHeader(header);
  if (!Number.isFinite(t) || v1.length === 0) throw new SignatureError('malformed signature header');
  if (toleranceSec > 0) {
    const age = Math.abs(Math.floor(Date.now() / 1000) - t);
    if (age > toleranceSec) throw new SignatureError('signature timestamp outside tolerance');
  }
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const matched = v1.some((candidate) => {
    const candBuf = Buffer.from(candidate, 'utf8');
    return candBuf.length === expectedBuf.length && timingSafeEqual(candBuf, expectedBuf);
  });
  if (!matched) throw new SignatureError('signature mismatch');
}

interface CheckoutMetadata {
  userId: string;
  packId: string;
}

/** Construct a synthetic checkout.session.completed event body (dev fake-checkout + tests). */
export function buildCheckoutCompletedEvent(params: {
  userId: string;
  packId: string;
  priceCents: number;
  eventId?: string;
  sessionId?: string;
}): { id: string; rawBody: string } {
  const id = params.eventId ?? `evt_${randomUUID().replace(/-/g, '')}`;
  const event = {
    id,
    object: 'event',
    type: HANDLED_EVENT,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: params.sessionId ?? `cs_test_${randomUUID().replace(/-/g, '')}`,
        object: 'checkout.session',
        payment_status: 'paid',
        amount_total: params.priceCents,
        currency: 'usd',
        metadata: { userId: params.userId, packId: params.packId } satisfies CheckoutMetadata,
      },
    },
  };
  return { id, rawBody: JSON.stringify(event) };
}

/**
 * Verify + process a Stripe webhook body. Safe to call repeatedly with the same event
 * (idempotent). Credits are derived from the pack on our side (packId), never trusted from
 * amount fields. Returns an HTTP-shaped result for the route to send.
 */
export async function handleStripeEvent(
  rawBody: string,
  sigHeader: string | null | undefined,
  client: PrismaClient = prisma
): Promise<HandlerResult> {
  try {
    verifyStripeSignature(rawBody, sigHeader, webhookSecret());
  } catch (e) {
    return { status: 400, body: { error: e instanceof Error ? e.message : 'invalid signature' } };
  }

  let event: { id?: string; type?: string; data?: { object?: { metadata?: Partial<CheckoutMetadata> } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'invalid json' } };
  }
  if (!event.id || !event.type) {
    return { status: 400, body: { error: 'missing event id or type' } };
  }

  // Fast idempotency: already recorded → nothing to do.
  const seen = await client.stripeEvent.findUnique({ where: { id: event.id } });
  if (seen) return { status: 200, body: { received: true, idempotent: true } };

  if (event.type !== HANDLED_EVENT) {
    await recordEvent(client, event.id, event.type, rawBody);
    return { status: 200, body: { received: true, ignored: event.type } };
  }

  const meta = event.data?.object?.metadata ?? {};
  if (!meta.userId || !meta.packId) {
    return { status: 400, body: { error: 'missing checkout metadata' } };
  }

  let pack: CreditPack;
  try {
    const packs = await loadPacks(client);
    pack = findPackOrThrow(packs, meta.packId);
  } catch {
    return { status: 400, body: { error: 'unknown pack' } };
  }

  const user = await client.user.findUnique({ where: { id: meta.userId } });
  if (!user) return { status: 400, body: { error: 'unknown user' } };

  // Credit first (idempotent on reference=event.id), then record the event for audit.
  await creditPurchase(client, {
    userId: meta.userId,
    amount: pack.credits,
    reason: 'purchase',
    reference: event.id,
    note: `Purchased ${pack.label} (${pack.credits} credits)`,
  });
  await recordEvent(client, event.id, event.type, rawBody);

  return { status: 200, body: { received: true, credited: pack.credits } };
}

async function recordEvent(client: PrismaClient, id: string, type: string, rawBody: string): Promise<void> {
  try {
    await client.stripeEvent.create({ data: { id, type, payloadJson: rawBody } });
  } catch {
    // concurrent duplicate delivery — the unique PK guards it; safe to ignore
  }
}

export interface CheckoutStart {
  redirectUrl: string;
  mode: 'stripe' | 'dev-fake';
}

function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !envFlag('DEV_FAKE_CHECKOUT', false);
}

function appUrl(): string {
  return process.env.APP_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000';
}

/**
 * Start a purchase for a pack. Production: create a real Stripe Checkout Session and return
 * its hosted URL. Dev/sandbox (DEV_FAKE_CHECKOUT or no secret key): mint a correctly-signed
 * checkout.session.completed and run it through the real handler, then bounce back to
 * billing. Either way the credits arrive via the same webhook code path.
 */
export async function startCheckout(
  user: { id: string },
  packId: string,
  client: PrismaClient = prisma
): Promise<CheckoutStart> {
  const packs = await loadPacks(client);
  const pack = findPackOrThrow(packs, packId);

  if (stripeConfigured()) {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: pack.priceCents,
            product_data: { name: `Reelforge ${pack.label} — ${pack.credits} credits` },
          },
        },
      ],
      metadata: { userId: user.id, packId: pack.id },
      success_url: `${appUrl()}/billing?purchased=${pack.credits}`,
      cancel_url: `${appUrl()}/billing?canceled=1`,
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return { redirectUrl: session.url, mode: 'stripe' };
  }

  // Dev fake-checkout: exercise the real webhook handler with a signed synthetic event.
  const { rawBody } = buildCheckoutCompletedEvent({
    userId: user.id,
    packId: pack.id,
    priceCents: pack.priceCents,
  });
  const header = signStripePayload(rawBody, webhookSecret());
  const result = await handleStripeEvent(rawBody, header, client);
  if (result.status !== 200) {
    throw new Error(`dev fake-checkout failed: ${JSON.stringify(result.body)}`);
  }
  return { redirectUrl: `/billing?purchased=${pack.credits}`, mode: 'dev-fake' };
}
