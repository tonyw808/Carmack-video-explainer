import { loadRootEnv, repoRootPath } from '@reelforge/core/env';
import path from 'node:path';
import { PrismaClient } from '../generated/client/index.js';

loadRootEnv();

export function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./.data/dev.db';
  if (raw.startsWith('file:')) {
    const p = raw.slice('file:'.length);
    if (!path.isAbsolute(p)) return 'file:' + path.resolve(repoRootPath(), p);
  }
  return raw;
}

function createClient(): PrismaClient {
  return new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });
}

// Reuse a single client across Next.js dev HMR reloads.
const globalStore = globalThis as { __reelforgePrisma?: PrismaClient };

export const prisma: PrismaClient = (globalStore.__reelforgePrisma ??= createClient());

/** For tests: a dedicated client bound to an explicit database URL. */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl });
}
