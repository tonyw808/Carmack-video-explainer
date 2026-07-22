import Link from 'next/link';
import { loadPacks, prisma } from '@reelforge/db';
import { auth } from '@/lib/auth';
import { formatCents } from '@/lib/ledger-format';

export const dynamic = 'force-dynamic';

const ASPECTS = [
  { label: 'Landscape', className: 'aspect-video' },
  { label: 'Portrait', className: 'aspect-[9/16]' },
  { label: 'Square', className: 'aspect-square' },
  { label: 'Landscape', className: 'aspect-video' },
];

export default async function LandingPage() {
  const session = await auth();
  const packs = await loadPacks(prisma);
  const primaryCta = session?.user ? '/generate' : '/signin';

  return (
    <div className="space-y-24 py-8">
      {/* Hero */}
      <section className="text-center">
        <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-fuchsia-500" />
          Text-to-video, minus the wait
        </div>
        <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
          Type a prompt. <span className="text-fuchsia-500">Get a video.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400">
          Reelforge turns text into finished, downloadable videos. Buy credits, describe the
          shot, and let the render farm do the rest — preview, download, and manage everything
          in your library.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href={primaryCta}
            className="rounded-lg bg-fuchsia-600 px-6 py-3 text-lg font-medium text-white hover:bg-fuchsia-500"
          >
            Start generating
          </Link>
          <Link
            href="#pricing"
            className="rounded-lg border border-zinc-700 px-6 py-3 text-lg font-medium text-zinc-200 hover:bg-zinc-800"
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* Example gallery (placeholders) */}
      <section>
        <h2 className="mb-6 text-center text-sm font-medium uppercase tracking-widest text-zinc-500">
          A few things people make
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {ASPECTS.map((a, i) => (
            <div
              key={i}
              className={`${a.className} flex items-end overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-fuchsia-950/30 to-zinc-900`}
            >
              <span className="p-3 text-xs text-zinc-500">{a.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="grid gap-8 sm:grid-cols-3">
        {[
          { n: '1', t: 'Buy credits', d: 'Grab a credit pack in test-mode Stripe. Credits never expire.' },
          { n: '2', t: 'Describe the shot', d: 'Prompt, duration, aspect ratio, style, and an optional reference image.' },
          { n: '3', t: 'Download the result', d: 'Watch it render in your queue, then play and download from your library.' },
        ].map((s) => (
          <div key={s.n} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-600 font-semibold text-white">
              {s.n}
            </div>
            <h3 className="mt-4 font-semibold">{s.t}</h3>
            <p className="mt-1 text-sm text-zinc-400">{s.d}</p>
          </div>
        ))}
      </section>

      {/* Pricing */}
      <section id="pricing">
        <h2 className="mb-2 text-center text-3xl font-bold">Simple credit packs</h2>
        <p className="mb-8 text-center text-zinc-400">Pay for what you generate. No subscription.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {packs.map((pack, i) => (
            <div
              key={pack.id}
              className={`flex flex-col rounded-xl border bg-zinc-900/60 p-6 ${
                i === 1 ? 'border-fuchsia-600' : 'border-zinc-800'
              }`}
            >
              <div className="text-lg font-semibold">{pack.label}</div>
              <div className="mt-2 text-4xl font-bold">{pack.credits}</div>
              <div className="text-sm text-zinc-500">credits</div>
              <div className="mt-4 text-2xl font-medium">{formatCents(pack.priceCents)}</div>
              <Link
                href={primaryCta}
                className={`mt-6 rounded-md px-3 py-2 text-center text-sm font-medium ${
                  i === 1
                    ? 'bg-fuchsia-600 text-white hover:bg-fuchsia-500'
                    : 'border border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
