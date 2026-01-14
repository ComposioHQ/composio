import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude e2e directories - they are separate packages with their own test commands
    exclude: ['**/node_modules/**', '**/dist/**', '**/test/e2e/**'],
  },
});
