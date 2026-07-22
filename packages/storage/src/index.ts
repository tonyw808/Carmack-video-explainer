import { loadRootEnv } from '@reelforge/core/env';
import { LocalStorageDriver } from './local';
import { S3StorageDriver, s3OptionsFromEnv } from './s3';
import type { StorageDriver } from './types';

export type { StorageDriver, StoredObject } from './types';
export { LocalStorageDriver } from './local';
export { S3StorageDriver, s3OptionsFromEnv } from './s3';

let singleton: StorageDriver | undefined;

/** Build the storage driver selected by STORAGE_DRIVER (default local). Memoized. */
export function getStorage(): StorageDriver {
  if (singleton) return singleton;
  loadRootEnv();
  const driver = process.env.STORAGE_DRIVER ?? 'local';
  if (driver === 's3') {
    singleton = new S3StorageDriver(s3OptionsFromEnv());
  } else {
    singleton = new LocalStorageDriver({ root: process.env.STORAGE_LOCAL_ROOT ?? '.data/storage' });
  }
  return singleton;
}

/** Explicit local driver (tests, or callers needing resolvePath). */
export function createLocalStorage(root: string): LocalStorageDriver {
  return new LocalStorageDriver({ root });
}

/** Test hook. */
export function resetStorageForTests(): void {
  singleton = undefined;
}
