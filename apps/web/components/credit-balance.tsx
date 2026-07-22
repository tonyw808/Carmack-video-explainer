'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Live-ish balance pill: fetches on mount, on window focus, and every 20s. Keeps the nav
// balance current after purchases and generations without a full page reload.
export function CreditBalance({ initial }: { initial: number }) {
  const [balance, setBalance] = useState(initial);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch('/api/credits/balance', { cache: 'no-store' });
        if (res.ok && alive) setBalance((await res.json()).balance);
      } catch {
        // ignore transient errors
      }
    }
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    const id = setInterval(load, 20000);
    void load();
    return () => {
      alive = false;
      window.removeEventListener('focus', onFocus);
      clearInterval(id);
    };
  }, []);

  return (
    <Link
      href="/billing"
      className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm text-zinc-300 hover:border-fuchsia-600"
      title="Credit balance"
    >
      <span className="font-semibold text-fuchsia-400">{balance}</span> credits
    </Link>
  );
}
