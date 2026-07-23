// Tests PdsCliProvider against a stub CLI runner that mimics the real pds JSON/exit-code
// contract. This proves the argv construction, JSON parsing, retry/backoff, timeout/cancel
// mapping, and the create→run→collect flow WITHOUT the real service. The real runtime shapes
// still require local verification (docs/LOCAL-VERIFY.md) — the stub encodes our best
// documented assumptions from the captured CLI help.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PdsCliProvider, type CliResult, type CliRunner } from './pds-cli';
import { ProviderError } from './types';
import type { JobParams } from '@reelforge/core';

const dirs: string[] = [];
function workDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'reelforge-pds-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const PARAMS: JobParams = { durationSec: 5, aspectRatio: '16:9', stylePreset: 'cinematic' };
function input(overrides: Partial<{ jobId: string; prompt: string }> = {}) {
  return {
    jobId: overrides.jobId ?? 'job_pds_1',
    prompt: overrides.prompt ?? 'a calm sea',
    params: PARAMS,
    workDir: workDir(),
  };
}

/** A programmable stub runner: maps the first two argv tokens to a canned result. */
function stubRunner(handlers: Record<string, (args: string[]) => CliResult>): CliRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(args) {
      calls.push(args);
      const key = `${args[0]} ${args[1]}`;
      const handler = handlers[key];
      if (!handler) return { stdout: '', stderr: `no stub for ${key}`, code: 127 };
      return handler(args);
    },
  };
}

const ok = (obj: unknown): CliResult => ({ stdout: JSON.stringify(obj), stderr: '', code: 0 });

describe('PdsCliProvider', () => {
  it('creates a project and sets the script, passing --json and the project name', async () => {
    const runner = stubRunner({
      'projects create': () => ok({ id: 'proj_123' }),
      'script set': () => ok({ ok: true }),
    });
    const provider = new PdsCliProvider({ runner, token: 't', apiUrl: 'http://x' });
    const handle = await provider.createJob(input({ jobId: 'job_abc' }));

    expect(handle.providerRef).toBe('proj_123');
    // argv assertions: project name derived from job id, --json appended
    const create = runner.calls.find((c) => c[1] === 'create')!;
    expect(create).toContain('--name');
    expect(create).toContain('reelforge-job_abc');
    expect(create).toContain('--json');
    const set = runner.calls.find((c) => c[0] === 'script')!;
    expect(set).toContain('--project');
    expect(set).toContain('proj_123');
    expect(set.join(' ')).toContain('--idempotency-key');
  });

  it('throws a provider error if the project id cannot be parsed', async () => {
    const runner = stubRunner({ 'projects create': () => ok({ unexpected: true }) });
    const provider = new PdsCliProvider({ runner });
    await expect(provider.createJob(input())).rejects.toBeInstanceOf(ProviderError);
  });

  it('runs the pipeline to the configured target and treats success status as done', async () => {
    const runner = stubRunner({
      'projects create': () => ok({ id: 'p1' }),
      'script set': () => ok({}),
      'pipeline run': () => ok({ runId: 'run_1', status: 'succeeded' }),
    });
    const provider = new PdsCliProvider({ runner, pipelineTarget: 'render' });
    const handle = await provider.createJob(input());
    await expect(provider.awaitCompletion(handle, input(), { timeoutMs: 1000 })).resolves.toBeUndefined();
    const run = runner.calls.find((c) => c[1] === 'run')!;
    expect(run).toContain('--to');
    expect(run).toContain('render');
    expect(run).toContain('--wait');
  });

  it('maps a failed pipeline status to a provider failure', async () => {
    const runner = stubRunner({
      'projects create': () => ok({ id: 'p1' }),
      'script set': () => ok({}),
      'pipeline run': () => ok({ runId: 'r', status: 'failed' }),
    });
    const provider = new PdsCliProvider({ runner });
    const handle = await provider.createJob(input());
    await expect(
      provider.awaitCompletion(handle, input(), { timeoutMs: 1000 })
    ).rejects.toMatchObject({ kind: 'failed' });
  });

  it('retries a transient non-zero exit, then succeeds', async () => {
    let attempts = 0;
    const runner = stubRunner({
      'projects create': () => {
        attempts++;
        return attempts < 2 ? { stdout: '', stderr: 'temporary', code: 1 } : ok({ id: 'p_ok' });
      },
      'script set': () => ok({}),
    });
    const provider = new PdsCliProvider({ runner, maxRetries: 3 });
    const handle = await provider.createJob(input());
    expect(handle.providerRef).toBe('p_ok');
    expect(attempts).toBe(2);
  });

  it('gives up after maxRetries and fails', async () => {
    const runner = stubRunner({ 'projects create': () => ({ stdout: '', stderr: 'always', code: 1 }) });
    const provider = new PdsCliProvider({ runner, maxRetries: 1 });
    await expect(provider.createJob(input())).rejects.toBeInstanceOf(ProviderError);
  });

  it('collects mp4 + thumbnail artifacts by local path', async () => {
    const dir = workDir();
    const srcMp4 = path.join(dir, 'render.mp4');
    const srcThumb = path.join(dir, 'poster.jpg');
    writeFileSync(srcMp4, Buffer.alloc(2048, 1));
    writeFileSync(srcThumb, Buffer.alloc(512, 2));
    const runner = stubRunner({
      'artifacts list': () =>
        ok({
          artifacts: [
            { kind: 'video', path: srcMp4, width: 1280, height: 720, durationSec: 5 },
            { kind: 'thumbnail', path: srcThumb },
          ],
        }),
    });
    const provider = new PdsCliProvider({ runner });
    const art = await provider.collectArtifacts({ providerRef: 'p1', projectId: 'p1' }, { ...input(), workDir: dir });
    expect(art.mp4Bytes).toBe(2048);
    expect(art.thumbBytes).toBe(512);
    expect(art.width).toBe(1280);
    expect(art.durationSec).toBe(5);
  });

  it('errors when no mp4 artifact is returned', async () => {
    const runner = stubRunner({ 'artifacts list': () => ok({ artifacts: [] }) });
    const provider = new PdsCliProvider({ runner });
    await expect(
      provider.collectArtifacts({ providerRef: 'p1', projectId: 'p1' }, input())
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('tolerates leading log lines before the JSON object', async () => {
    const runner = stubRunner({
      'projects create': () => ({ stdout: 'info: connecting…\n{"id":"p_noise"}', stderr: '', code: 0 }),
      'script set': () => ok({}),
    });
    const provider = new PdsCliProvider({ runner });
    const handle = await provider.createJob(input());
    expect(handle.providerRef).toBe('p_noise');
  });
});
