// Root env loading shared by every process (web, worker, scripts, tests).
// Precedence: real environment > repo-root .env > repo-root .env.defaults (committed).
// scripts/with-root-env.mjs mirrors this for plain-node contexts (prisma CLI).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let cachedRoot: string | undefined;

/** Walk upward from cwd (or a hint) to the directory containing pnpm-workspace.yaml. */
export function repoRootPath(startDir?: string): string {
  if (cachedRoot) return cachedRoot;
  let dir = path.resolve(startDir ?? process.cwd());
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      // Not inside the workspace (e.g. deployed bundle): fall back to cwd.
      cachedRoot = path.resolve(startDir ?? process.cwd());
      return cachedRoot;
    }
    dir = parent;
  }
}

function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2] ?? '';
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1] as string] = v;
  }
  return out;
}

let loaded = false;

/**
 * Idempotently load .env / .env.defaults from the repo root into process.env and
 * absolutize a relative sqlite DATABASE_URL against the repo root.
 */
export function loadRootEnv(startDir?: string): void {
  if (loaded) return;
  loaded = true;
  const root = repoRootPath(startDir);
  for (const file of ['.env', '.env.defaults']) {
    const vars = parseEnvFile(path.join(root, file));
    for (const [k, v] of Object.entries(vars)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
  const url = process.env.DATABASE_URL;
  if (url?.startsWith('file:')) {
    const p = url.slice('file:'.length);
    if (!path.isAbsolute(p)) {
      process.env.DATABASE_URL = 'file:' + path.resolve(root, p);
    }
  }
}

/** Test hook: reset the module's memoization. */
export function resetEnvCacheForTests(): void {
  loaded = false;
  cachedRoot = undefined;
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}
