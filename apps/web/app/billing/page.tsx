import { getBalance, loadPacks, prisma } from '@reelforge/db';
import { requireUser } from '@/lib/session';
import { formatCents, formatCredits, reasonLabel } from '@/lib/ledger-format';
import { BuyButton } from './buy-button';

export const dynamic = 'force-dynamic';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string; canceled?: string }>;
}) {
  const user = await requireUser();
  const { purchased, canceled } = await searchParams;

  const [balance, packs, ledger] = await Promise.all([
    getBalance(prisma, user.id),
    loadPacks(prisma),
    prisma.creditLedgerEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
  ]);

  return (
    <div className="space-y-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <div className="text-right">
          <div className="text-sm text-zinc-500">Balance</div>
          <div className="text-3xl font-bold text-fuchsia-400">{balance}</div>
          <div className="text-xs text-zinc-500">credits</div>
        </div>
      </div>

      {purchased && (
        <div className="rounded-md border border-emerald-900 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-300">
          Purchase complete — {purchased} credits added to your balance.
        </div>
      )}
      {canceled && (
        <div className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
          Checkout canceled. No charge was made.
        </div>
      )}

      <section>
        <h2 className="mb-4 text-lg font-medium">Buy credits</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {packs.map((pack) => (
            <div
              key={pack.id}
              className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
            >
              <div className="text-lg font-semibold">{pack.label}</div>
              <div className="mt-2 text-3xl font-bold">{pack.credits}</div>
              <div className="text-sm text-zinc-500">credits</div>
              <div className="mt-4 mb-4 text-2xl font-medium text-zinc-200">
                {formatCents(pack.priceCents)}
              </div>
              <div className="mt-auto">
                <BuyButton packId={pack.id} label={`Buy ${pack.label}`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">Ledger history</h2>
        {ledger.length === 0 ? (
          <p className="text-sm text-zinc-500">No transactions yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-left text-zinc-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={entry.id} className="border-t border-zinc-800">
                    <td className="whitespace-nowrap px-4 py-2 text-zinc-400">
                      {entry.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-2">
                      {reasonLabel(entry.reason)}
                      {entry.note && <span className="ml-2 text-xs text-zinc-500">{entry.note}</span>}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        entry.delta > 0 ? 'text-emerald-400' : 'text-zinc-300'
                      }`}
                    >
                      {formatCredits(entry.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
