/**
 * CLI `composio toolkits list` e2e test
 *
 * Verifies that the list subcommand returns toolkits as JSON in piped mode,
 * supports --query filtering (exact, prefix, no fuzzy), and respects --limit.
 */

import { e2e, sanitizeOutput, type E2ETestResult } from '@e2e-tests/utils';
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
      exactResult = await runCmd('composio toolkits list --query gmail --limit 1');
      prefixResult = await runCmd('composio toolkits list --query gmai --limit 1');
      noFuzzyResult = await runCmd('composio toolkits list --query gmal --limit 1');
    }, TIMEOUTS.FIXTURE);

    describe('composio toolkits list --query gmail --limit 1 (exact slug)', () => {
      it('exits successfully', () => {
        expect(exactResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(exactResult.stderr).toBe('');
      });

      it('stdout is a JSON array with 1 element', () => {
        const items = JSON.parse(sanitizeOutput(exactResult.stdout));
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(1);
      });

      it('the element has slug "gmail"', () => {
        const items = JSON.parse(sanitizeOutput(exactResult.stdout));
        expect(items[0].slug).toBe('gmail');
      });

      it('the element has the expected shape', () => {
        const item = JSON.parse(sanitizeOutput(exactResult.stdout))[0];
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('slug');
        expect(item).toHaveProperty('description');
        // `toolkits list` without user-id uses legacy listing output.
        expect(item).toHaveProperty('latest_version');
        expect(item).toHaveProperty('tools_count');
        expect(item).toHaveProperty('triggers_count');
      });
    });

    describe('composio toolkits list --query gmai --limit 1 (prefix search)', () => {
      it('exits successfully', () => {
        expect(prefixResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(prefixResult.stderr).toBe('');
      });

      it('stdout is a JSON array with 1 element', () => {
        const items = JSON.parse(sanitizeOutput(prefixResult.stdout));
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(1);
      });

      it('the element has slug "gmail"', () => {
        const items = JSON.parse(sanitizeOutput(prefixResult.stdout));
        expect(items[0].slug).toBe('gmail');
      });
    });

    describe('composio toolkits list --query gmal --limit 1 (no fuzzy search)', () => {
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
