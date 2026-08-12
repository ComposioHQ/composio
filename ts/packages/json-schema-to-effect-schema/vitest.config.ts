import { defineConfig } from 'vitest/config';
import path from 'node:path';

const packageDir = path.resolve(path.dirname(new URL(import.meta.url).pathname));

export default defineConfig({
  resolve: {
    alias: {
      '@composio/json-schema-to-zod': path.resolve(
        packageDir,
        '../json-schema-to-zod/src/index.ts'
      ),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
