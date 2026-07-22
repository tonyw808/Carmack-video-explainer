import { defineConfig } from 'vitest/config';

// A web-specific test-db dir (see test-utils.ts) keeps the db/web/queue projects from
// sharing a SQLite template. createTestDb builds it lazily in the worker, where test.env
// applies — no global setup, no shared main-process state.
export default defineConfig({
  test: {
    name: 'web',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    env: {
      REELFORGE_TEST_DB_DIR: '.data/test-web',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_fixture_secret',
      DEV_FAKE_CHECKOUT: '1',
    },
  },
});
