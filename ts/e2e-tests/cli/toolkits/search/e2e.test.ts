/**
 * CLI `composio dev toolkits search` e2e test
 *
 * Verifies that the search subcommand returns matching toolkits as JSON in piped mode,
 * respects --limit, supports stdout redirection, and handles no-result queries.
 */

import {
  e2e,
  sanitizeOutput,
  parseJsonStdout,
  type E2ETestResult,
  type E2ETestResultWithFiles,
} from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect, beforeAll } from 'bun:test';

declare module 'bun' {
  interface Env {
    COMPOSIO_USER_API_KEY: string;
  }
}

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  env: {
    COMPOSIO_USER_API_KEY: Bun.env.COMPOSIO_USER_API_KEY,
  },
  defineTests: ({ runCmd }) => {
    let validResult: E2ETestResult;
    let limitResult: E2ETestResult;
    let redirectResult: E2ETestResultWithFiles<'out.json'>;
    let noResultsResult: E2ETestResult;

    beforeAll(async () => {
      validResult = await runCmd('composio dev toolkits search gmail');
      limitResult = await runCmd('composio dev toolkits search gmail --limit 1');
      redirectResult = await runCmd({
        command: 'composio dev toolkits search gmail --limit 1 > out.json',
        files: ['out.json'],
      });
      noResultsResult = await runCmd('composio dev toolkits search xyznonexistent_abc_12345');
    }, TIMEOUTS.FIXTURE);

    describe('composio dev toolkits search gmail (known query)', () => {
      it('exits successfully', () => {
        expect(validResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(validResult.stderr).toBe('');
      });

      it('stdout is a JSON array with at least 1 element', () => {
        const items = parseJsonStdout(validResult);
        expect(Array.isArray(items)).toBe(true);
        expect((items as Array<unknown>).length).toBeGreaterThanOrEqual(1);
      });

      it('first element has slug "gmail"', () => {
        const items = parseJsonStdout(validResult) as Array<{ slug: string }>;
        expect(items[0].slug).toBe('gmail');
      });

      it('each element has the expected shape', () => {
        const items = parseJsonStdout(validResult) as Array<Record<string, unknown>>;
        for (const item of items) {
          expect(item).toHaveProperty('name');
          expect(item).toHaveProperty('slug');
          expect(item).toHaveProperty('tools_count');
          expect(item).toHaveProperty('triggers_count');
          expect(item).toHaveProperty('description');
        }
      });
    });

    describe('composio dev toolkits search gmail --limit 1 (with limit)', () => {
      it('exits successfully', () => {
        expect(limitResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(limitResult.stderr).toBe('');
      });

      it('stdout is a JSON array with exactly 1 element', () => {
        const items = parseJsonStdout(limitResult);
        expect(Array.isArray(items)).toBe(true);
        expect(items as Array<unknown>).toHaveLength(1);
      });

      it('the element has slug "gmail"', () => {
        const items = parseJsonStdout(limitResult) as Array<{ slug: string }>;
        expect(items[0].slug).toBe('gmail');
      });
    });

    describe('composio dev toolkits search gmail --limit 1 > out.json (stdout redirection)', () => {
      it('exits successfully', () => {
        expect(redirectResult.exitCode).toBe(0);
      });

      it('stdout is empty', () => {
        expect(redirectResult.stdout).toBe('');
      });

      it('stderr is empty', () => {
        expect(redirectResult.stderr).toBe('');
      });

      it('out.json contains a JSON array with slug "gmail"', () => {
        const items = JSON.parse(sanitizeOutput(redirectResult.files['out.json']));
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(1);
        expect(items[0].slug).toBe('gmail');
      });
    });

    describe('composio dev toolkits search xyznonexistent_abc_12345 (no results)', () => {
      it('exits successfully', () => {
        expect(noResultsResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(noResultsResult.stderr).toBe('');
      });

      it('stdout is an empty JSON array (no results)', () => {
        expect(sanitizeOutput(noResultsResult.stdout)).toBe('[]');
      });
    });
  },
});
