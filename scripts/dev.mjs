#!/usr/bin/env node
// Boots the full dev profile: web (Next.js) + worker, with prefixed output.
// Zero external services required — SQLite, db queue driver, local storage, MockProvider.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const procs = [
  { name: 'web', color: '\x1b[36m', cmd: 'pnpm', args: ['--filter', '@reelforge/web', 'dev'] },
  { name: 'worker', color: '\x1b[35m', cmd: 'pnpm', args: ['--filter', '@reelforge/worker', 'dev'] },
];

const children = [];
let shuttingDown = false;

function prefix(name, color, chunk) {
  const reset = '\x1b[0m';
  for (const line of chunk.toString().split('\n')) {
    if (line.trim() === '') continue;
    process.stdout.write(`${color}[${name}]${reset} ${line}\n`);
  }
}

for (const p of procs) {
  const child = spawn(p.cmd, p.args, { cwd: root, env: process.env });
  child.stdout.on('data', (c) => prefix(p.name, p.color, c));
  child.stderr.on('data', (c) => prefix(p.name, p.color, c));
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[dev] ${p.name} exited with code ${code}; shutting down.`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) c.kill('SIGINT');
  setTimeout(() => process.exit(code), 3000).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
