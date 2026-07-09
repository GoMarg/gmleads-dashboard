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
    // CI checks out gmleads-shared/gmleads-infra as literal subdirectories
    // (gmleads-shared-src/, gmleads-infra-src/) to satisfy the file:../
    // sibling dependency — vitest's default test discovery has no root
    // restriction, so without this it picks up gmleads-shared's own unit
    // tests (e.g. jwt.test.ts, password.test.ts) and runs them against
    // this repo's node_modules, which doesn't have jsonwebtoken/argon2
    // (see decisions.md, KAN-99).
    exclude: ['**/node_modules/**', '**/.git/**', 'gmleads-shared-src/**', 'gmleads-infra-src/**'],
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
