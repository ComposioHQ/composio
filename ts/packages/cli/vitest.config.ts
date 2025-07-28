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
    include: ['test/**/*.test.ts'],
    // When defined, Vitest will run all matched files with import.meta.vitest inside.
    includeSource: ['src/**/*.ts', 'test/__utils__/*-compiler.ts'],
    unstubEnvs: true,
    globalSetup: './test/__utils__/vitest.global-setup.ts',
  },
});
