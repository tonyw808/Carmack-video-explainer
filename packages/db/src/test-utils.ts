// Per-test-file isolated database: clones the template SQLite file produced by
// test-global-setup.ts. Cheap (file copy), fully isolated, safe to parallelize.
import { copyFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from './client';
import type { PrismaClient } from '../generated/client/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '../../..');
const testDir = path.join(repoRoot, '.data/test');
const templateDb = path.join(testDir, 'template.db');

export interface TestDb {
  client: PrismaClient;
  url: string;
  filePath: string;
  disconnect: () => Promise<void>;
}

export function createTestDb(): TestDb {
  mkdirSync(testDir, { recursive: true });
  const filePath = path.join(testDir, `db-${randomBytes(6).toString('hex')}.db`);
  copyFileSync(templateDb, filePath);
  const url = 'file:' + filePath;
  const client = createPrismaClient(url);
  return {
    client,
    url,
    filePath,
    disconnect: () => client.$disconnect(),
  };
}
