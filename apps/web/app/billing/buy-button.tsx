'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BuyButton({ packId, label }: { packId: string; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed');
      if (data.redirectUrl?.startsWith('http')) {
        window.location.href = data.redirectUrl; // Stripe-hosted page
      } else {
        router.push(data.redirectUrl); // dev fake-checkout bounce-back
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={buy}
        disabled={loading}
        className="w-full rounded-md bg-fuchsia-600 px-3 py-2 font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
      >
        {loading ? 'Processing…' : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
