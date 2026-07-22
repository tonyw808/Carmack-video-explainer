import { defineConfig } from 'vitest/config';

// Use a web-specific test-db dir so the db-package and web projects never race on the
// same SQLite template. Set at config load (main process) so globalSetup sees it, and
// mirrored into test.env for the worker processes.
process.env.REELFORGE_TEST_DB_DIR ??= '.data/test-web';

export default defineConfig({
  test: {
    name: 'web',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    globalSetup: '../../packages/db/src/test-global-setup.ts',
    env: {
      REELFORGE_TEST_DB_DIR: '.data/test-web',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_fixture_secret',
      DEV_FAKE_CHECKOUT: '1',
    },
  },
});
