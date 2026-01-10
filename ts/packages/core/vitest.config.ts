import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '#platform': path.resolve(__dirname, 'src/platform/node.ts'),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/test-e2e/**'],
  },
});
