import { defineConfig } from 'vitest/config';
import path from 'node:path';

const __dirname = path.resolve(path.dirname(new URL(import.meta.url).pathname));

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './'),
      src: path.resolve(__dirname, './src'),
      test: path.resolve(__dirname, './test'),
    },
  },
  test: {
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
    includeSource: ['src/**/*.ts', 'test/**/*.ts'],
    globalSetup: './test/__utils__/vitest.global-setup.ts',
  },
});
