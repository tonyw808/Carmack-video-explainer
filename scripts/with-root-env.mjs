#!/usr/bin/env node
// Runs a command with the repo-root env files loaded (.env then .env.defaults, never
// overriding already-set vars) and DATABASE_URL file: paths absolutized against the repo
// root. Mirror of packages/core/src/env.ts for contexts that can't import TS (prisma CLI).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

for (const file of ['.env', '.env.defaults']) {
  const vars = parseEnvFile(path.join(root, file));
  for (const [k, v] of Object.entries(vars)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const url = process.env.DATABASE_URL;
if (url && url.startsWith('file:')) {
  const p = url.slice('file:'.length);
  if (!path.isAbsolute(p)) {
    process.env.DATABASE_URL = 'file:' + path.resolve(root, p);
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: with-root-env.mjs <command> [args...]');
  process.exit(2);
}
const child = spawn(cmd, args, { stdio: 'inherit', env: process.env });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
