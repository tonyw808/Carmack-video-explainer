import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'db',
    passWithNoTests: true,
    fileParallelism: false,
  },
});
