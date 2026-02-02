/**
 * CommonJS compatibility e2e test
 *
 * Verifies that @composio/core can be imported using require() in Node.js.
 */

import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

e2e(import.meta.url, {
  nodeVersions: [
    // may throw ERR_REQUIRE_ESM
    '20.18.0',
    // supports ESM by default
    '20.19.0',
    '22.12.0',
  ],
  usesFixtures: true,
  defineTests: ({ runFixture }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'test.cjs' });
    });

    describe('CommonJS compatibility', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('require() succeeds', () => {
        expect(result.stdout).toContain('Test 1 passed: require() succeeded');
      });

      it('exports Composio class', () => {
        expect(result.stdout).toContain('Test 2 passed: Composio class is exported');
      });

      it('exports OpenAIProvider class', () => {
        expect(result.stdout).toContain('Test 3 passed: OpenAIProvider class is exported');
      });

      it('instantiates OpenAIProvider successfully', () => {
        expect(result.stdout).toContain('Test 4 passed: OpenAIProvider instantiated successfully');
      });

      it('exports AuthScheme', () => {
        expect(result.stdout).toContain('Test 5 passed: AuthScheme is exported');
      });

      it('exports Error classes', () => {
        expect(result.stdout).toContain('Test 6 passed: Error classes are exported');
      });

      it('exports jsonSchemaToZodSchema', () => {
        expect(result.stdout).toContain('Test 7 passed: jsonSchemaToZodSchema is exported');
      });

      it('exports constants namespace', () => {
        expect(result.stdout).toContain('Test 8 passed: constants namespace is exported');
      });

      it('exports logger', () => {
        expect(result.stdout).toContain('Test 9 passed: logger is exported');
      });

      it('completes all tests', () => {
        expect(result.stdout).toContain('All CommonJS compatibility tests passed!');
      });
    });
  },
});
