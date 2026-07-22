// Starts a credit-pack purchase. Returns a redirect URL (a Stripe-hosted Checkout page in
// production, or the dev fake-checkout bounce-back in the sandbox).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiUser } from '@/lib/session';
import { startCheckout } from '@/lib/billing';

const bodySchema = z.object({ packId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'packId required' }, { status: 400 });
  }

  try {
    const result = await startCheckout(user, parsed.data.packId);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'checkout failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
