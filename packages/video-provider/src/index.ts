import { loadRootEnv } from '@reelforge/core/env';
import { MockProvider } from './mock';
import { PdsCliProvider } from './pds-cli';
import type { VideoProvider } from './types';

export * from './types';
export { MockProvider } from './mock';
export { PdsCliProvider, type CliRunner, type CliResult, type PdsCliOptions } from './pds-cli';

let singleton: VideoProvider | undefined;

/** Build the provider selected by VIDEO_PROVIDER (default mock). Memoized. */
export function getVideoProvider(): VideoProvider {
  if (singleton) return singleton;
  loadRootEnv();
  const name = process.env.VIDEO_PROVIDER ?? 'mock';
  singleton = buildProvider(name);
  return singleton;
}

function buildProvider(name: string): VideoProvider {
  switch (name) {
    case 'mock':
      return new MockProvider();
    case 'pds-cli':
      // Structured against the real CLI, but its runtime behavior must be verified locally
      // before the first paid run (docs/LOCAL-VERIFY.md). Requires PDS_TOKEN + PDS_API_URL.
      return new PdsCliProvider();
    default:
      throw new Error(`unknown VIDEO_PROVIDER "${name}" (supported: mock, pds-cli)`);
  }
}

export function resetProviderForTests(): void {
  singleton = undefined;
}
