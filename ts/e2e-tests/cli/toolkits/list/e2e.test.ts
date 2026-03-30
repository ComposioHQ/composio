/**
 * CLI `composio dev toolkits list` e2e test
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
    const query = 'hackernews';
    const missingQuery = 'xyznonexistent_abc_12345';
    let exactResult: E2ETestResult;
    let noFuzzyResult: E2ETestResult;

    beforeAll(async () => {
      [exactResult, noFuzzyResult] = await Promise.all([
        runCmd(`composio dev toolkits list --query ${query} --limit 1`),
        runCmd(`composio dev toolkits list --query ${missingQuery} --limit 1`),
      ]);
    }, TIMEOUTS.FIXTURE * 2);

    describe('composio dev toolkits list --query <query> --limit 1 (known query)', () => {
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

      it('returns the discovered toolkit', () => {
        const item = (parseJsonStdout(exactResult) as Array<Record<string, unknown>>)[0];
        expect(item?.slug).toBe(query);
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

    describe('composio dev toolkits list --query <missing-query> --limit 1 (no fuzzy search)', () => {
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
