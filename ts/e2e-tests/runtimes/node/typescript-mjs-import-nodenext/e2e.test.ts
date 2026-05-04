/**
 * TypeScript .mjs import resolution e2e test
 *
 * Verifies that representative generated TypeScript files using `.js` imports
 * compile successfully with moduleResolution: "nodenext".
 */

import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

e2e(import.meta.url, {
  versions: { node: ['current'] },
  defineTests: ({ runFixture }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'fixtures/index.mjs' });
    }, 300_000);

    describe('TypeScript .mjs import resolution', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('fixture generated files exist', () => {
        expect(result.stdout).toContain('Test 1 passed: Fixture generated files exist');
      });

      it('TypeScript compilation succeeds', () => {
        expect(result.stdout).toContain('Test 2 passed: TypeScript compilation succeeded');
      });

      it('completes all tests', () => {
        expect(result.stdout).toContain('All tests passed!');
      });
    });
  },
});
