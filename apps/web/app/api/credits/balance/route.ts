import { NextResponse } from 'next/server';
import { getBalance, prisma } from '@reelforge/db';
import { getApiUser } from '@/lib/session';

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const balance = await getBalance(prisma, user.id);
  return NextResponse.json({ balance });
}
