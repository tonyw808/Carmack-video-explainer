import { defineConfig } from 'vitest/config';

// Worker-specific test-db dir so this project never races db/web/queue on the SQLite
// template (see packages/db/src/test-utils.ts).
export default defineConfig({
  test: {
    name: 'worker',
    fileParallelism: false,
    env: {
      REELFORGE_TEST_DB_DIR: '.data/test-worker',
      VIDEO_PROVIDER: 'mock',
      STORAGE_DRIVER: 'local',
    },
  },
});
