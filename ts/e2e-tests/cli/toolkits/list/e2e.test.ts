/**
 * CLI `composio manage toolkits list` e2e test
 *
 * Verifies that the list subcommand returns toolkits as JSON in piped mode,
 * supports --query filtering (exact, prefix, no fuzzy), and respects --limit.
 */

import { e2e, sanitizeOutput, parseJsonStdout, type E2ETestResult } from '@e2e-tests/utils';
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
    let exactResult: E2ETestResult;
    let prefixResult: E2ETestResult;
    let noFuzzyResult: E2ETestResult;

    beforeAll(async () => {
      exactResult = await runCmd('composio manage toolkits list --query gmail --limit 1');
      prefixResult = await runCmd('composio manage toolkits list --query gmai --limit 1');
      noFuzzyResult = await runCmd('composio manage toolkits list --query gmal --limit 1');
    }, TIMEOUTS.FIXTURE);

    describe('composio manage toolkits list --query gmail --limit 1 (exact slug)', () => {
      it('exits successfully', () => {
        expect(exactResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(exactResult.stderr).toBe('');
      });

      it('stdout is a JSON array with 1 element', () => {
        const items = parseJsonStdout(exactResult);
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(1);
      });

      it('the element has slug "gmail"', () => {
        const items = parseJsonStdout(exactResult) as Array<{ slug: string }>;
        expect(items[0].slug).toBe('gmail');
      });

      it('the element has the expected shape', () => {
        const item = (parseJsonStdout(exactResult) as Array<Record<string, unknown>>)[0];
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('slug');
        expect(item).toHaveProperty('description');
        expect(item).toHaveProperty('latest_version');
        expect(item).toHaveProperty('tools_count');
        expect(item).toHaveProperty('triggers_count');
        expect(item).toHaveProperty('is_no_auth');
        expect(item).toHaveProperty('enabled');
        expect(item).toHaveProperty('connected');
      });
    });

    describe('composio manage toolkits list --query gmai --limit 1 (prefix search)', () => {
      it('exits successfully', () => {
        expect(prefixResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(prefixResult.stderr).toBe('');
      });

      it('stdout is a JSON array with 1 element', () => {
        const items = parseJsonStdout(prefixResult);
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(1);
      });

      it('the element has slug "gmail"', () => {
        const items = parseJsonStdout(prefixResult) as Array<{ slug: string }>;
        expect(items[0].slug).toBe('gmail');
      });
    });

    describe('composio manage toolkits list --query gmal --limit 1 (no fuzzy search)', () => {
      it('exits successfully', () => {
        expect(noFuzzyResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(noFuzzyResult.stderr).toBe('');
      });

      it('stdout is an empty JSON array (no results)', () => {
        expect(sanitizeOutput(noFuzzyResult.stdout)).toBe('[]');
      });
    });
  },
});
