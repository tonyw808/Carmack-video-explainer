import { defineConfig } from 'vitest/config';

// Queue-specific test-db dir (see db/src/test-utils.ts) so the queue project never races the
// db/web projects on a shared SQLite template.
export default defineConfig({
  test: {
    name: 'queue',
    fileParallelism: false,
    env: {
      REELFORGE_TEST_DB_DIR: '.data/test-queue',
    },
  },
});
