import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Same reasoning as gmleads-dashboard/gmleads-gateway's vitest.config.ts
    // (KAN-99): only relevant here if a sibling CI checkout is ever added
    // for this app, but kept for consistency and defense-in-depth.
    exclude: ['**/node_modules/**', '**/.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
});
