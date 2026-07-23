import { loadRootEnv, repoRootPath } from '@reelforge/core/env';
import path from 'node:path';
import { PrismaClient } from '../generated/client/index.js';

loadRootEnv();

/**
 * SQLite is a single-writer database. Forcing one connection per client serializes this
 * process's interactive transactions (so they never self-deadlock or time out competing
 * for the write lock); cross-process contention still surfaces as SQLITE_BUSY, which the
 * ledger's withWriteRetry handles. No-op for Postgres URLs.
 */
export function withSqliteParams(url: string): string {
  if (!url.startsWith('file:')) return url;
  if (url.includes('connection_limit=')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'connection_limit=1';
}

export function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./.data/dev.db';
  if (raw.startsWith('file:')) {
    const [pathPart, query] = raw.slice('file:'.length).split('?');
    const abs = path.isAbsolute(pathPart!) ? pathPart! : path.resolve(repoRootPath(), pathPart!);
    return withSqliteParams('file:' + abs + (query ? '?' + query : ''));
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
