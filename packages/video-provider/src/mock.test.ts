import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MockProvider } from './mock';
import { ProviderError } from './types';
import type { JobParams } from '@reelforge/core';

const dirs: string[] = [];
function workDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'reelforge-mock-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function input(overrides: Partial<{ prompt: string; params: JobParams }> = {}) {
  const wd = workDir();
  return {
    jobId: 'job_test',
    prompt: overrides.prompt ?? 'a calm ocean at dawn',
    params: overrides.params ?? {
      durationSec: 5,
      aspectRatio: '16:9' as const,
      stylePreset: 'cinematic' as const,
    },
    workDir: wd,
  };
}

describe('MockProvider', () => {
  it('produces a real mp4 + thumbnail on success', async () => {
    const provider = new MockProvider({ minMs: 5, maxMs: 10, failureRate: 0 });
    const inp = input();
    const handle = await provider.createJob(inp);
    expect(handle.providerRef).toBe('mock_job_test');

    const progresses: number[] = [];
    await provider.awaitCompletion(handle, inp, { timeoutMs: 5000, onProgress: (p) => progresses.push(p) });
    const art = await provider.collectArtifacts(handle, inp);

    expect(statSync(art.mp4Path).size).toBeGreaterThan(1000);
    expect(statSync(art.thumbPath).size).toBeGreaterThan(500);
    expect(art.width).toBe(640);
    expect(art.height).toBe(360);
    expect(art.durationSec).toBeGreaterThan(0);
    expect(progresses.at(-1)).toBe(100);
  });

  it('selects the asset matching the aspect ratio', async () => {
    const provider = new MockProvider({ minMs: 1, maxMs: 2 });
    const inp = input({ params: { durationSec: 4, aspectRatio: '9:16', stylePreset: 'anime' } });
    const handle = await provider.createJob(inp);
    await provider.awaitCompletion(handle, inp, { timeoutMs: 3000 });
    const art = await provider.collectArtifacts(handle, inp);
    expect(art.width).toBe(360);
    expect(art.height).toBe(640);
  });

  it('fails deterministically on the [force-fail] marker', async () => {
    const provider = new MockProvider({ minMs: 1, maxMs: 2, failureRate: 0 });
    const inp = input({ prompt: 'please break [force-fail]' });
    const handle = await provider.createJob(inp);
    await expect(
      provider.awaitCompletion(handle, inp, { timeoutMs: 3000 })
    ).rejects.toMatchObject({ kind: 'failed' });
  });

  it('always fails when failureRate is 1', async () => {
    const provider = new MockProvider({ minMs: 1, maxMs: 2, failureRate: 1 });
    const inp = input();
    const handle = await provider.createJob(inp);
    await expect(provider.awaitCompletion(handle, inp, { timeoutMs: 3000 })).rejects.toBeInstanceOf(
      ProviderError
    );
  });

  it('times out when work exceeds the deadline', async () => {
    const provider = new MockProvider({ minMs: 5000, maxMs: 5000, failureRate: 0 });
    const inp = input();
    const handle = await provider.createJob(inp);
    await expect(
      provider.awaitCompletion(handle, inp, { timeoutMs: 120 })
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('cancels when the signal aborts', async () => {
    const provider = new MockProvider({ minMs: 5000, maxMs: 5000, failureRate: 0 });
    const inp = input();
    const handle = await provider.createJob(inp);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);
    await expect(
      provider.awaitCompletion(handle, inp, { timeoutMs: 5000, signal: ac.signal })
    ).rejects.toMatchObject({ kind: 'canceled' });
  });

  it('provides user-safe messages per failure kind', () => {
    expect(new ProviderError('failed', 'x').userSafeMessage).toMatch(/refunded/i);
    expect(new ProviderError('timeout', 'x').userSafeMessage).toMatch(/timed out/i);
    expect(new ProviderError('canceled', 'x').userSafeMessage).toMatch(/canceled/i);
  });
});
