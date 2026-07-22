// Per-test-file isolated database. The first call in a project lazily builds a schema
// template (prisma db push) into that project's test-db dir; every createTestDb then clones
// it (a cheap file copy). The dir is per-project via REELFORGE_TEST_DB_DIR (set in each
// vitest project's test.env) so projects never share or race on a template. No global setup
// is used — that avoided a main-process env-pollution bug across projects.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient, withSqliteParams } from './client';
import type { PrismaClient } from '../generated/client/index.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(here, '..');
const repoRoot = path.join(pkgRoot, '../..');

function testDir(): string {
  const configured = process.env.REELFORGE_TEST_DB_DIR;
  if (configured) return path.isAbsolute(configured) ? configured : path.join(repoRoot, configured);
  return path.join(repoRoot, '.data/test');
}

function prismaCli(args: string[], env: Record<string, string>): void {
  const cli = require.resolve('prisma/build/index.js');
  execFileSync(process.execPath, [cli, ...args], { cwd: pkgRoot, env: { ...process.env, ...env }, stdio: 'pipe' });
}

function ensureTemplate(dir: string): string {
  const template = path.join(dir, 'template.db');
  if (existsSync(template)) return template;
  mkdirSync(dir, { recursive: true });
  if (!existsSync(path.join(pkgRoot, 'generated/client/index.js'))) {
    prismaCli(['generate'], { DATABASE_URL: 'file:' + template });
  }
  prismaCli(['db', 'push', '--skip-generate', '--accept-data-loss'], { DATABASE_URL: 'file:' + template });
  return template;
}

export interface TestDb {
  client: PrismaClient;
  url: string;
  filePath: string;
  disconnect: () => Promise<void>;
}

export function createTestDb(): TestDb {
  const dir = testDir();
  const template = ensureTemplate(dir);
  const filePath = path.join(dir, `db-${randomBytes(6).toString('hex')}.db`);
  copyFileSync(template, filePath);
  const url = withSqliteParams('file:' + filePath);
  const client = createPrismaClient(url);
  return {
    client,
    url,
    filePath,
    disconnect: async () => {
      await client.$disconnect();
      rmSync(filePath, { force: true });
    },
  };
}
