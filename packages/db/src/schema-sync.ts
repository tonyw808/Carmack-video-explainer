// Generates prisma/schema.postgres.prisma from prisma/schema.prisma (the SQLite
// source of truth) and verifies the two never drift.
//   tsx src/schema-sync.ts write  → (re)generate the postgres schema
//   tsx src/schema-sync.ts check  → exit 1 if the committed postgres schema is stale
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = path.join(here, '../prisma/schema.prisma');
const postgresPath = path.join(here, '../prisma/schema.postgres.prisma');

export function derivePostgresSchema(sqliteSchema: string): string {
  const header =
    '// GENERATED FILE — do not edit. Source: schema.prisma (SQLite profile).\n' +
    '// Regenerate with: pnpm --filter @reelforge/db sync-schemas\n' +
    '// Use for production: prisma migrate deploy --schema prisma/schema.postgres.prisma\n\n';
  const swapped = sqliteSchema.replace(
    /provider = "sqlite"/,
    'provider = "postgresql"'
  );
  if (swapped === sqliteSchema) {
    throw new Error('expected `provider = "sqlite"` in schema.prisma');
  }
  return header + swapped;
}

const mode = process.argv[2];
const expected = derivePostgresSchema(readFileSync(sqlitePath, 'utf8'));

if (mode === 'write') {
  writeFileSync(postgresPath, expected);
  console.log('[schema-sync] wrote schema.postgres.prisma');
} else if (mode === 'check') {
  let actual = '';
  try {
    actual = readFileSync(postgresPath, 'utf8');
  } catch {
    console.error('[schema-sync] schema.postgres.prisma missing — run sync-schemas');
    process.exit(1);
  }
  if (actual !== expected) {
    console.error('[schema-sync] schema.postgres.prisma is stale — run sync-schemas');
    process.exit(1);
  }
  console.log('[schema-sync] schemas in sync');
} else if (mode !== undefined) {
  console.error('usage: schema-sync.ts [write|check]');
  process.exit(2);
}
