import Link from 'next/link';
import { getBalance, loadPricing, prisma } from '@reelforge/db';
import { requireUser } from '@/lib/session';
import { GenerateForm } from './generate-form';

export const dynamic = 'force-dynamic';

export default async function GeneratePage() {
  const user = await requireUser();
  const [balance, pricing] = await Promise.all([getBalance(prisma, user.id), loadPricing(prisma)]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Generate a video</h1>
        <div className="text-sm text-zinc-400">
          Balance: <span className="font-semibold text-fuchsia-400">{balance}</span> credits
        </div>
      </div>

      {balance <= 0 && (
        <div className="mb-6 rounded-md border border-amber-900 bg-amber-950/50 px-4 py-3 text-sm text-amber-300">
          You have no credits.{' '}
          <Link href="/billing" className="underline">
            Buy a credit pack
          </Link>{' '}
          to start generating.
        </div>
      )}

      <GenerateForm pricing={pricing} balance={balance} />
    </div>
  );
}
