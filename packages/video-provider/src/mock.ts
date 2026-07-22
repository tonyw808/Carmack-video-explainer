// The default provider in this environment. It emits a REAL small mp4 + thumbnail (the
// committed sample assets, chosen by aspect ratio) after a simulated delay, and can be made
// to fail so the refund path is testable. It never calls the network.
//
// Failure is triggered either randomly (MOCK_FAILURE_RATE, 0..1) or deterministically when
// the prompt contains the marker [force-fail] — handy for demos and e2e tests.
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envFloat, envInt } from '@reelforge/core/env';
import {
  ProviderError,
  type CompletionOptions,
  type ProviderArtifacts,
  type ProviderHandle,
  type ProviderJobInput,
  type VideoProvider,
} from './types';

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets');

interface AssetEntry {
  mp4: string;
  thumb: string;
  width: number;
  height: number;
  durationSec: number;
  mp4Bytes: number;
  thumbBytes: number;
}
type Manifest = Record<string, AssetEntry>;

let manifestCache: Manifest | undefined;
async function manifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache;
  const parsed = JSON.parse(await readFile(path.join(ASSETS_DIR, 'manifest.json'), 'utf8')) as Manifest;
  manifestCache = parsed;
  return parsed;
}

function assetKey(aspectRatio: string): string {
  return aspectRatio.replace(':', 'x'); // '16:9' -> '16x9'
}

export interface MockProviderOptions {
  minMs?: number;
  maxMs?: number;
  failureRate?: number;
}

export class MockProvider implements VideoProvider {
  readonly name = 'mock';
  private readonly minMs: number;
  private readonly maxMs: number;
  private readonly failureRate: number;

  constructor(opts: MockProviderOptions = {}) {
    this.minMs = opts.minMs ?? envInt('MOCK_MIN_MS', 3000);
    this.maxMs = opts.maxMs ?? envInt('MOCK_MAX_MS', 7000);
    this.failureRate = opts.failureRate ?? envFloat('MOCK_FAILURE_RATE', 0);
  }

  async createJob(input: ProviderJobInput): Promise<ProviderHandle> {
    await mkdir(input.workDir, { recursive: true });
    return { providerRef: `mock_${input.jobId}` };
  }

  async awaitCompletion(
    _handle: ProviderHandle,
    input: ProviderJobInput,
    opts: CompletionOptions
  ): Promise<void> {
    const span = Math.max(0, this.maxMs - this.minMs);
    const durationMs = this.minMs + Math.floor(Math.random() * (span + 1));
    const start = Date.now();

    // The natural work timer races an independent hard-timeout timer and the abort signal.
    await new Promise<void>((resolve, reject) => {
      const tick = setInterval(() => {
        const elapsed = Date.now() - start;
        opts.onProgress?.(Math.min(99, Math.floor((elapsed / durationMs) * 100)));
      }, 250);
      const done = setTimeout(() => {
        cleanup();
        resolve();
      }, durationMs);
      const timeout = setTimeout(() => {
        cleanup();
        reject(new ProviderError('timeout', 'mock timeout'));
      }, opts.timeoutMs);
      const onAbort = () => {
        cleanup();
        reject(new ProviderError('canceled', 'mock canceled'));
      };
      const cleanup = () => {
        clearInterval(tick);
        clearTimeout(done);
        clearTimeout(timeout);
        opts.signal?.removeEventListener('abort', onAbort);
      };
      if (opts.signal?.aborted) return onAbort();
      opts.signal?.addEventListener('abort', onAbort, { once: true });
    });

    // Decide success/failure after the "work" completes.
    const forced = input.prompt.includes('[force-fail]');
    if (forced || Math.random() < this.failureRate) {
      throw new ProviderError('failed', 'mock injected failure', { retryable: false });
    }
    opts.onProgress?.(100);
  }

  async collectArtifacts(
    _handle: ProviderHandle,
    input: ProviderJobInput
  ): Promise<ProviderArtifacts> {
    const m = await manifest();
    const entry = m[assetKey(input.params.aspectRatio)] ?? m['16x9'];
    if (!entry) throw new ProviderError('failed', 'mock asset manifest missing');

    const mp4Path = path.join(input.workDir, 'output.mp4');
    const thumbPath = path.join(input.workDir, 'thumbnail.jpg');
    await copyFile(path.join(ASSETS_DIR, entry.mp4), mp4Path);
    await copyFile(path.join(ASSETS_DIR, entry.thumb), thumbPath);

    return {
      mp4Path,
      thumbPath,
      width: entry.width,
      height: entry.height,
      durationSec: entry.durationSec,
      mp4Bytes: entry.mp4Bytes,
      thumbBytes: entry.thumbBytes,
    };
  }

  async cancel(): Promise<void> {
    // Nothing external to stop; awaitCompletion resolves via its abort signal.
  }
}
