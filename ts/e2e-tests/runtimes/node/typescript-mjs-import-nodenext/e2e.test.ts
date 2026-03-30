/**
 * TypeScript .mjs import resolution e2e test
 *
 * Verifies that generated TypeScript files with .mjs imports
 * can be compiled successfully with moduleResolution: "nodenext".
 *
 * Requires COMPOSIO_API_KEY environment variable to be set.
 */

import { e2e, type E2ETestResultWithSetup } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

declare module 'bun' {
  interface Env {
    COMPOSIO_API_KEY: string;
    COMPOSIO_USER_API_KEY: string;
  }
}

e2e(import.meta.url, {
  versions: { node: ['current'] },
  usesFixtures: true,
  env: {
    COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
    COMPOSIO_USER_API_KEY: Bun.env.COMPOSIO_USER_API_KEY,
  },
  defineTests: ({ runFixture }) => {
    let result: E2ETestResultWithSetup;

    beforeAll(async () => {
      result = await runFixture({
        filename: 'index.mjs',
        setup: 'node setup.mjs',
      });
    }, 300_000);

    describe('setup', () => {
      it('composio generate ts succeeds', () => {
        expect(result.setup.exitCode).toBe(0);
        expect(result.setup.stdout).toContain('Test 1 passed: composio generate ts succeeded');
      });
    });

    describe('TypeScript .mjs import resolution', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('generated files exist', () => {
        expect(result.stdout).toContain('Test 2 passed: Generated files exist');
      });

      it('TypeScript compilation succeeds', () => {
        expect(result.stdout).toContain('Test 3 passed: TypeScript compilation succeeded');
      });

      it('completes all tests', () => {
        expect(result.stdout).toContain('All tests passed!');
      });
    });
  },
});
