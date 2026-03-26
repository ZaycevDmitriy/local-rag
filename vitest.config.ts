import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    exclude: ['dist/**', 'node_modules/**'],
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    exclude: [
      'dist/**',
      'node_modules/**',
      'src/**/index.ts',
      'src/storage/migrations/**',
    ],
    thresholds: {
      statements: 80,
      branches: 74,
      functions: 76,
      lines: 80,
    },
  },
});
