import { loadRootEnv } from '@reelforge/core/env';
import { MockProvider } from './mock';
import type { VideoProvider } from './types';

export * from './types';
export { MockProvider } from './mock';

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
    // 'pds-cli' is registered in Slice 6 (PdsCliProvider) once its runtime behavior is
    // verified against the real CLI (docs/LOCAL-VERIFY.md). Registered lazily there to keep
    // this factory free of the CLI subprocess code path in the default build.
    default:
      throw new Error(
        `unknown VIDEO_PROVIDER "${name}" (supported here: mock; pds-cli requires local verification)`
      );
  }
}

export function resetProviderForTests(): void {
  singleton = undefined;
}
