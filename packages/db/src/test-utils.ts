// Per-test-file isolated database: clones the template SQLite file produced by
// test-global-setup.ts. Cheap (file copy), fully isolated, safe to parallelize.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient, withSqliteParams } from './client';
import type { PrismaClient } from '../generated/client/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '../../..');

function testDir(): string {
  const configured = process.env.REELFORGE_TEST_DB_DIR;
  if (configured) return path.isAbsolute(configured) ? configured : path.join(repoRoot, configured);
  return path.join(repoRoot, '.data/test');
}

export interface TestDb {
  client: PrismaClient;
  url: string;
  filePath: string;
  disconnect: () => Promise<void>;
}

export function createTestDb(): TestDb {
  const dir = testDir();
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `db-${randomBytes(6).toString('hex')}.db`);
  copyFileSync(path.join(dir, 'template.db'), filePath);
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
