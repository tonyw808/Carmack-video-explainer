// Dev-only helper: fetch the most recent magic link recorded for an email address.
// Hard-disabled in production builds regardless of env flags.
import { NextRequest, NextResponse } from 'next/server';
import { devMagicLinkEnabled, readMagicLink } from '@/lib/dev-magic-link';

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' || !devMagicLinkEnabled()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const email = req.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email query param required' }, { status: 400 });
  }
  const entry = readMagicLink(email);
  if (!entry) {
    return NextResponse.json({ error: 'no link recorded for that email' }, { status: 404 });
  }
  return NextResponse.json(entry);
}
