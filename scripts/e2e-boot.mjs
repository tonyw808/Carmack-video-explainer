#!/usr/bin/env node
// Boots the e2e stack: reset+migrate+seed the (env-provided) database FIRST, then start the
// web+worker orchestrator in-process. Doing the DB setup here — rather than in Playwright's
// globalSetup — guarantees the schema exists before the server issues its first query.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const dbPkg = path.join(repoRoot, 'packages/db');
const req = createRequire(pathToFileURL(path.join(dbPkg, 'package.json')));

const dbUrl = process.env.DATABASE_URL ?? '';
const filePath = dbUrl.startsWith('file:') ? dbUrl.slice('file:'.length).split('?')[0] : null;
if (filePath) rmSync(filePath, { force: true });

execFileSync(process.execPath, [req.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
  cwd: dbPkg,
  stdio: 'inherit',
});
execFileSync(process.execPath, [req.resolve('tsx/cli'), path.join(dbPkg, 'src/seed.ts')], {
  cwd: dbPkg,
  stdio: 'inherit',
});
console.log('[e2e-boot] database ready — starting web + worker');

await import(pathToFileURL(path.join(here, 'dev.mjs')).href);
