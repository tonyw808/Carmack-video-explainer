'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
// Import the PURE core modules directly (not the barrel), so this client component never
// pulls env.ts / node:fs into the browser bundle.
import {
  ASPECT_RATIOS,
  STYLE_PRESETS,
  MIN_DURATION_SEC,
  MAX_DURATION_SEC,
  MAX_PROMPT_LENGTH,
  type AspectRatio,
  type StylePreset,
} from '@reelforge/core/params';
import { computeJobCost, type Pricing } from '@reelforge/core/pricing';

const STYLE_LABELS: Record<StylePreset, string> = {
  cinematic: 'Cinematic',
  realistic: 'Realistic',
  anime: 'Anime',
  claymation: 'Claymation',
  retro: 'Retro',
};

const ASPECT_LABELS: Record<AspectRatio, string> = {
  '16:9': 'Landscape 16:9',
  '9:16': 'Portrait 9:16',
  '1:1': 'Square 1:1',
};

export function GenerateForm({ pricing, balance }: { pricing: Pricing; balance: number }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [durationSec, setDurationSec] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [stylePreset, setStylePreset] = useState<StylePreset>('cinematic');
  const [referenceImageKey, setReferenceImageKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live cost preview uses the SAME pure pricing function the server bills with.
  const cost = useMemo(() => computeJobCost({ durationSec }, pricing), [durationSec, pricing]);
  const affordable = cost <= balance;

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setReferenceImageKey(data.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          durationSec,
          aspectRatio,
          stylePreset,
          ...(referenceImageKey ? { referenceImageKey } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Submission failed');
      router.push('/queue');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
      setSubmitting(false);
    }
  }

  const canSubmit = prompt.trim().length > 0 && affordable && !submitting && !uploading;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label htmlFor="prompt" className="mb-1 block text-sm font-medium text-zinc-300">
          Prompt
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT_LENGTH))}
          rows={4}
          placeholder="A cinematic drone shot gliding over misty redwood forest at dawn…"
          className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-fuchsia-500"
          required
        />
        <div className="mt-1 text-right text-xs text-zinc-500">
          {prompt.length}/{MAX_PROMPT_LENGTH}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="duration" className="mb-1 block text-sm font-medium text-zinc-300">
            Duration: <span className="text-zinc-100">{durationSec}s</span>
          </label>
          <input
            id="duration"
            type="range"
            min={MIN_DURATION_SEC}
            max={MAX_DURATION_SEC}
            value={durationSec}
            onChange={(e) => setDurationSec(Number(e.target.value))}
            className="w-full accent-fuchsia-500"
          />
        </div>

        <div>
          <label htmlFor="aspect" className="mb-1 block text-sm font-medium text-zinc-300">
            Aspect ratio
          </label>
          <select
            id="aspect"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-fuchsia-500"
          >
            {ASPECT_RATIOS.map((a) => (
              <option key={a} value={a}>
                {ASPECT_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium text-zinc-300">Style</span>
        <div className="flex flex-wrap gap-2">
          {STYLE_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStylePreset(s)}
              className={`rounded-full border px-4 py-1.5 text-sm ${
                stylePreset === s
                  ? 'border-fuchsia-500 bg-fuchsia-500/20 text-fuchsia-200'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              {STYLE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="ref" className="mb-1 block text-sm font-medium text-zinc-300">
          Reference image <span className="text-zinc-500">(optional)</span>
        </label>
        <input
          id="ref"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onUpload}
          className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-zinc-200 hover:file:bg-zinc-700"
        />
        {uploading && <p className="mt-1 text-xs text-zinc-500">Uploading…</p>}
        {referenceImageKey && !uploading && (
          <p className="mt-1 text-xs text-emerald-400">Reference image attached ✓</p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div className="text-sm text-zinc-400">
          Cost preview
          <div className="text-xs text-zinc-500">
            {pricing.baseCredits} base + {pricing.perSecondCredits}/s × {durationSec}s
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${affordable ? 'text-fuchsia-400' : 'text-red-400'}`}>
            {cost}
          </div>
          <div className="text-xs text-zinc-500">credits</div>
        </div>
      </div>

      {!affordable && (
        <p className="text-sm text-red-400">
          This costs {cost} credits but you have {balance}. Reduce the duration or buy more credits.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-fuchsia-600 px-4 py-3 text-lg font-medium text-white hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : `Generate for ${cost} credits`}
      </button>
    </form>
  );
}
