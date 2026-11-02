import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    testTimeout: 60_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/env.ts'],
  },
});
