// Dev-profile magic-link capture: with no SMTP configured, sign-in links are logged to
// the server console and (when AUTH_DEV_MAGIC_LINK=1, never in production) written to
// .data/dev/magic-links.json so tests and the dev endpoint can retrieve them.
import { envFlag, repoRootPath } from '@reelforge/core/env';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function storePath(): string {
  return path.join(repoRootPath(), '.data/dev/magic-links.json');
}

export function devMagicLinkEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && envFlag('AUTH_DEV_MAGIC_LINK', true);
}

export function recordMagicLink(email: string, url: string): void {
  if (!devMagicLinkEnabled()) return;
  const file = storePath();
  mkdirSync(path.dirname(file), { recursive: true });
  let store: Record<string, { url: string; at: string }> = {};
  try {
    store = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // first write or corrupt file — start fresh
  }
  store[email.toLowerCase()] = { url, at: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(store, null, 2));
}

export function readMagicLink(email: string): { url: string; at: string } | null {
  if (!devMagicLinkEnabled()) return null;
  try {
    const store = JSON.parse(readFileSync(storePath(), 'utf8'));
    return store[email.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}
