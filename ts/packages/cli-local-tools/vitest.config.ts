import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['vendor/**', 'dist/**', 'node_modules/**'],
  },
});
