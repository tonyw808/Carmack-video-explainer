import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { envFlag, envInt, loadRootEnv, repoRootPath, resetEnvCacheForTests } from './env';

describe('env loader', () => {
  afterEach(() => {
    resetEnvCacheForTests();
  });

  it('finds the repo root from a nested directory', () => {
    const root = repoRootPath(path.dirname(new URL(import.meta.url).pathname));
    expect(root.endsWith('Carmack-video-explainer')).toBe(true);
  });

  it('loads defaults without overriding the real environment', () => {
    process.env.QUEUE_DRIVER = 'memory';
    delete process.env.STORAGE_DRIVER;
    loadRootEnv();
    expect(process.env.QUEUE_DRIVER).toBe('memory'); // real env wins
    expect(process.env.STORAGE_DRIVER).toBe('local'); // filled from .env.defaults
    delete process.env.QUEUE_DRIVER;
  });

  it('absolutizes relative sqlite DATABASE_URL against the repo root', () => {
    process.env.DATABASE_URL = 'file:./.data/x.db';
    loadRootEnv();
    expect(process.env.DATABASE_URL).toBe('file:' + path.join(repoRootPath(), '.data/x.db'));
    delete process.env.DATABASE_URL;
  });

  it('parses numeric and flag envs with fallbacks', () => {
    process.env.SOME_INT = '42';
    process.env.SOME_FLAG = 'true';
    expect(envInt('SOME_INT', 7)).toBe(42);
    expect(envInt('MISSING_INT', 7)).toBe(7);
    expect(envFlag('SOME_FLAG')).toBe(true);
    expect(envFlag('MISSING_FLAG', true)).toBe(true);
    delete process.env.SOME_INT;
    delete process.env.SOME_FLAG;
  });
});
