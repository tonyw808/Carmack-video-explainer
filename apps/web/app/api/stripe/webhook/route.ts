// Stripe webhook endpoint. Receives real Stripe events in production and the dev
// fake-checkout's signed synthetic events in the sandbox — identical handling either way.
// The raw body must be read verbatim for signature verification (no JSON parsing first).
import { NextRequest, NextResponse } from 'next/server';
import { handleStripeEvent } from '@/lib/billing';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature');
  const result = await handleStripeEvent(rawBody, sig);
  return NextResponse.json(result.body, { status: result.status });
}
