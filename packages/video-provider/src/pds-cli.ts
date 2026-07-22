// PdsCliProvider — orchestrates the real PDS CLI (@promptdriven/pds) as the video provider.
//
// The command NAMES and FLAGS below are taken from the actual CLI help captured in Phase 0
// (docs/pds-cli-notes.md); they are not guessed. However, every RUNTIME behavior — the JSON
// response shapes, exit codes, and how artifact bytes are retrieved — is UNVERIFIED from this
// sandbox (the API host is unreachable here). Each such spot is marked `LOCAL-VERIFY` and
// must be confirmed on a machine with real PDS credentials before the first paid run. See
// docs/LOCAL-VERIFY.md. Unit tests exercise this class against a stub `pds` binary, proving
// the argv/JSON/exit-code plumbing without the real service.
import { execFile } from 'node:child_process';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { envInt } from '@reelforge/core/env';
import {
  ProviderError,
  type CompletionOptions,
  type ProviderArtifacts,
  type ProviderHandle,
  type ProviderJobInput,
  type VideoProvider,
} from './types';

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Runs the CLI. Injectable so tests can substitute a stub without spawning processes. */
export interface CliRunner {
  run(args: string[], opts: { cwd: string; timeoutMs: number; signal?: AbortSignal }): Promise<CliResult>;
}

export interface PdsCliOptions {
  apiUrl?: string;
  token?: string;
  bin?: string;
  pipelineTarget?: string;
  timeoutMs?: number;
  maxRetries?: number;
  concurrency?: number;
  runner?: CliRunner;
}

// A tiny counting semaphore to cap concurrent CLI invocations (provider-level, independent
// of the worker's job concurrency).
class Semaphore {
  private available: number;
  private waiters: Array<() => void> = [];
  constructor(count: number) {
    this.available = Math.max(1, count);
  }
  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.available--;
    return () => this.release();
  }
  private release(): void {
    this.available++;
    const next = this.waiters.shift();
    if (next) next();
  }
}

class ExecFileRunner implements CliRunner {
  constructor(
    private readonly bin: string,
    private readonly env: NodeJS.ProcessEnv
  ) {}
  run(args: string[], opts: { cwd: string; timeoutMs: number; signal?: AbortSignal }): Promise<CliResult> {
    return new Promise((resolve, reject) => {
      execFile(
        this.bin,
        args,
        { cwd: opts.cwd, timeout: opts.timeoutMs, signal: opts.signal, env: this.env, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error && (error as NodeJS.ErrnoException).code === 'ABORT_ERR') {
            return reject(new ProviderError('canceled', 'pds canceled'));
          }
          if (error && (error as { killed?: boolean }).killed) {
            return reject(new ProviderError('timeout', 'pds timed out'));
          }
          const code = typeof (error as { code?: number })?.code === 'number' ? (error as { code: number }).code : error ? 1 : 0;
          resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
        }
      );
    });
  }
}

interface Handle extends ProviderHandle {
  projectId: string;
  runId?: string;
}

function parseJson(stdout: string): unknown {
  // The CLI prints one final JSON object with --json. Be tolerant of leading log lines.
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.lastIndexOf('{');
    if (start >= 0) {
      try {
        return JSON.parse(trimmed.slice(start));
      } catch {
        /* fall through */
      }
    }
    return undefined;
  }
}

// LOCAL-VERIFY: exact field names for project id, run id, status, and artifact entries.
function pick(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

export class PdsCliProvider implements VideoProvider {
  readonly name = 'pds-cli';
  private readonly bin: string;
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly pipelineTarget: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly runner: CliRunner;
  private readonly sem: Semaphore;

  constructor(opts: PdsCliOptions = {}) {
    this.bin = opts.bin ?? process.env.PDS_BIN ?? 'pds';
    this.apiUrl = opts.apiUrl ?? process.env.PDS_API_URL ?? 'https://video.promptdriven.ai';
    this.token = opts.token ?? process.env.PDS_TOKEN ?? '';
    this.pipelineTarget = opts.pipelineTarget ?? process.env.PDS_PIPELINE_TARGET ?? 'render';
    this.timeoutMs = opts.timeoutMs ?? envInt('PROVIDER_TIMEOUT_MS', 900_000);
    this.maxRetries = opts.maxRetries ?? envInt('PROVIDER_MAX_RETRIES', 2);
    this.runner =
      opts.runner ??
      new ExecFileRunner(this.bin, {
        ...process.env,
        PDS_API_URL: this.apiUrl,
        PDS_TOKEN: this.token,
      });
    this.sem = new Semaphore(opts.concurrency ?? envInt('PDS_CONCURRENCY', 2));
  }

  private async cli(
    args: string[],
    workDir: string,
    signal?: AbortSignal
  ): Promise<CliResult> {
    const release = await this.sem.acquire();
    try {
      let attempt = 0;
      let last: CliResult | undefined;
      for (;;) {
        const result = await this.runner.run([...args, '--json'], {
          cwd: workDir,
          timeoutMs: this.timeoutMs,
          signal,
        });
        if (result.code === 0) return result;
        last = result;
        // Bounded retry with backoff for transient (non-zero) failures.
        // LOCAL-VERIFY: which exit codes are transient vs terminal.
        if (attempt >= this.maxRetries) return last;
        attempt++;
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
    } finally {
      release();
    }
  }

  async createJob(input: ProviderJobInput): Promise<Handle> {
    // 1. Create an isolated project for this job.
    const created = await this.cli(
      ['projects', 'create', '--name', `reelforge-${input.jobId}`],
      input.workDir
    );
    if (created.code !== 0) {
      throw new ProviderError('failed', `pds projects create failed: ${created.stderr || created.stdout}`);
    }
    const projectId = pick(parseJson(created.stdout), ['id', 'projectId', 'project_id']); // LOCAL-VERIFY
    if (!projectId) {
      throw new ProviderError('failed', 'could not parse project id from pds projects create');
    }

    // 2. Write the prompt as the script and upload it.
    const scriptPath = path.join(input.workDir, 'script.md');
    await writeFile(scriptPath, buildScript(input));
    const scriptSet = await this.cli(
      ['script', 'set', '--project', projectId, '--file', scriptPath, '--idempotency-key', `reelforge:job:${input.jobId}:script`],
      input.workDir
    );
    if (scriptSet.code !== 0) {
      throw new ProviderError('failed', `pds script set failed: ${scriptSet.stderr || scriptSet.stdout}`);
    }

    return { providerRef: projectId, projectId };
  }

  async awaitCompletion(
    handle: Handle,
    input: ProviderJobInput,
    opts: CompletionOptions
  ): Promise<void> {
    // Run the pipeline to the configured target and wait for the durable run.
    const run = await this.cli(
      ['pipeline', 'run', '--project', handle.projectId, '--to', this.pipelineTarget, '--wait', '--idempotency-key', `reelforge:job:${input.jobId}:run`],
      input.workDir,
      opts.signal
    );
    if (run.code !== 0) {
      // LOCAL-VERIFY: distinguish provider failure vs timeout vs cancel by exit code.
      throw new ProviderError('failed', `pds pipeline run failed (exit ${run.code}): ${run.stderr || run.stdout}`);
    }
    const parsed = parseJson(run.stdout);
    handle.runId = pick(parsed, ['runId', 'run_id', 'id']); // LOCAL-VERIFY
    const status = pick(parsed, ['status', 'state']); // LOCAL-VERIFY
    if (status && !/^(succeeded|success|complete|completed|ready)$/i.test(status)) {
      throw new ProviderError('failed', `pds pipeline finished with status "${status}"`);
    }
    opts.onProgress?.(100);
  }

  async collectArtifacts(handle: Handle, input: ProviderJobInput): Promise<ProviderArtifacts> {
    const listed = await this.cli(['artifacts', 'list', '--project', handle.projectId], input.workDir);
    if (listed.code !== 0) {
      throw new ProviderError('failed', `pds artifacts list failed: ${listed.stderr || listed.stdout}`);
    }
    // LOCAL-VERIFY: the shape of `artifacts list --json` and how to fetch bytes. The block
    // below assumes each artifact carries a local `path` the CLI already materialized; if the
    // real CLI returns signed URLs or artifact ids instead, replace this with the documented
    // download step.
    const parsed = parseJson(listed.stdout) as { artifacts?: Array<Record<string, unknown>> } | undefined;
    const artifacts = parsed?.artifacts ?? [];
    const mp4 = findArtifact(artifacts, /\.mp4$/i, ['video', 'mp4', 'output']);
    const thumb = findArtifact(artifacts, /\.(jpg|jpeg|png)$/i, ['thumbnail', 'thumb', 'poster']);
    if (!mp4) {
      throw new ProviderError('failed', 'no mp4 artifact returned by pds');
    }

    const mp4Path = path.join(input.workDir, 'output.mp4');
    const thumbPath = path.join(input.workDir, 'thumbnail.jpg');
    await materialize(mp4, mp4Path);
    if (thumb) await materialize(thumb, thumbPath);

    const mp4Bytes = (await readFile(mp4Path)).byteLength;
    let thumbBytes = 0;
    try {
      thumbBytes = (await readFile(thumbPath)).byteLength;
    } catch {
      // thumbnail optional
    }

    // LOCAL-VERIFY: real width/height/duration from the artifact metadata (or ffprobe).
    return {
      mp4Path,
      thumbPath,
      width: num(mp4.width) ?? 1280,
      height: num(mp4.height) ?? 720,
      durationSec: num(mp4.durationSec ?? mp4.duration) ?? input.params.durationSec,
      mp4Bytes,
      thumbBytes,
    };
  }

  async cancel(handle: Handle, input: ProviderJobInput): Promise<void> {
    // LOCAL-VERIFY: pipeline stop vs jobs cancel semantics and whether paid work is charged.
    await this.cli(['pipeline', 'stop', '--project', handle.projectId], input.workDir).catch(() => {});
  }
}

function buildScript(input: ProviderJobInput): string {
  const { durationSec, aspectRatio, stylePreset } = input.params;
  return [
    `# Reelforge generation ${input.jobId}`,
    '',
    input.prompt,
    '',
    `Duration: ${durationSec}s`,
    `Aspect ratio: ${aspectRatio}`,
    `Style: ${stylePreset}`,
  ].join('\n');
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function findArtifact(
  artifacts: Array<Record<string, unknown>>,
  extRe: RegExp,
  kindHints: string[]
): Record<string, unknown> | undefined {
  return artifacts.find((a) => {
    const p = (a.path ?? a.file ?? a.url ?? a.name) as string | undefined;
    const kind = (a.kind ?? a.type ?? '') as string;
    return (p && extRe.test(p)) || kindHints.some((h) => kind.toLowerCase().includes(h));
  });
}

// LOCAL-VERIFY: replace with the real download mechanism if artifacts are not local paths.
async function materialize(artifact: Record<string, unknown>, dest: string): Promise<void> {
  const localPath = (artifact.path ?? artifact.file) as string | undefined;
  if (localPath) {
    await rename(localPath, dest).catch(async () => {
      const bytes = await readFile(localPath);
      await writeFile(dest, bytes);
    });
    return;
  }
  throw new ProviderError('failed', 'artifact has no local path (LOCAL-VERIFY: implement URL download)');
}

// Re-export for callers/tests that need the directory listing helper.
export async function listWorkDir(dir: string): Promise<string[]> {
  return readdir(dir);
}
