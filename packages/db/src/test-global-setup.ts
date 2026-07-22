// Vitest global setup for DB-backed tests: pushes the schema into a template SQLite
// file once; each test file then clones the template (see test-utils.ts).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(here, '..');
const repoRoot = path.join(pkgRoot, '../..');

// Each vitest project points at its own dir (via REELFORGE_TEST_DB_DIR) so their template
// builds never race on the same SQLite file. Defaults to .data/test for the db package.
export function testDbDir(): string {
  const configured = process.env.REELFORGE_TEST_DB_DIR;
  if (configured) return path.isAbsolute(configured) ? configured : path.join(repoRoot, configured);
  return path.join(repoRoot, '.data/test');
}

export const TEST_DB_DIR = testDbDir();
export const TEMPLATE_DB = path.join(TEST_DB_DIR, 'template.db');

function prismaCli(args: string[], env: Record<string, string> = {}) {
  const cli = require.resolve('prisma/build/index.js');
  execFileSync(process.execPath, [cli, ...args], {
    cwd: pkgRoot,
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });
}

export default function setup() {
  const dir = testDbDir();
  const template = path.join(dir, 'template.db');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  if (!existsSync(path.join(pkgRoot, 'generated/client/index.js'))) {
    prismaCli(['generate'], { DATABASE_URL: 'file:' + template });
  }
  prismaCli(['db', 'push', '--skip-generate', '--accept-data-loss'], {
    DATABASE_URL: 'file:' + template,
  });
}
