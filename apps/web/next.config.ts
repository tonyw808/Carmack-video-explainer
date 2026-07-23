import type { NextConfig } from 'next';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Load repo-root .env / .env.defaults before anything else runs. Self-contained
// (config files can't reliably import workspace TS); mirrors packages/core/src/env.ts.
const repoRoot = path.resolve(import.meta.dirname, '../..');
for (const file of ['.env', '.env.defaults']) {
  const full = path.join(repoRoot, file);
  if (!existsSync(full)) continue;
  for (const line of readFileSync(full, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2] ?? '';
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1] as string] === undefined) process.env[m[1] as string] = v;
  }
}
const dbUrl = process.env.DATABASE_URL;
if (dbUrl?.startsWith('file:') && !path.isAbsolute(dbUrl.slice(5))) {
  process.env.DATABASE_URL = 'file:' + path.resolve(repoRoot, dbUrl.slice(5));
}

const nextConfig: NextConfig = {
  transpilePackages: [
    '@reelforge/core',
    '@reelforge/db',
    '@reelforge/queue',
    '@reelforge/storage',
    '@reelforge/video-provider',
  ],
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
