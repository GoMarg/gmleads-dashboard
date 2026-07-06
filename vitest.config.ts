import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    // Integration tests share one real Postgres/Redis; running test files in
    // parallel means one file's TRUNCATE can wipe out another file's in-flight session.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
});
