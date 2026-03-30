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
    let exactResult: E2ETestResult;
    let prefixResult: E2ETestResult;
    let noFuzzyResult: E2ETestResult;
    let candidate: { slug: string };
    let prefixQuery: string;
    let typoQuery: string;

    beforeAll(async () => {
      const seedResult = await runCmd('composio dev toolkits list --limit 1');
      const items = parseJsonStdout(seedResult) as Array<{ slug?: string }>;

      if (seedResult.exitCode !== 0 || items.length === 0) {
        throw new Error('Expected `composio dev toolkits list --limit 1` to return 1 item');
      }

      const [item] = items;
      if (typeof item.slug !== 'string') {
        throw new Error('Expected seed toolkit to include a string `slug`');
      }

      candidate = {
        slug: item.slug,
      };
      prefixQuery = candidate.slug.length > 1 ? candidate.slug.slice(0, -1) : candidate.slug;
      typoQuery = `${candidate.slug}_xyznonexistent_abc_12345`;

      [exactResult, prefixResult, noFuzzyResult] = await Promise.all([
        runCmd(`composio dev toolkits list --query ${candidate.slug} --limit 1`),
        runCmd(`composio dev toolkits list --query ${prefixQuery} --limit 1`),
        runCmd(`composio dev toolkits list --query ${typoQuery} --limit 1`),
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
        expect(item?.slug).toBe(candidate.slug);
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

    describe('composio dev toolkits list --query <prefix> --limit 1 (prefix search)', () => {
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

      it('the element has a slug', () => {
        const items = parseJsonStdout(prefixResult) as Array<{ slug: string }>;
        expect(typeof items[0]?.slug).toBe('string');
        expect(items[0]?.slug.startsWith(prefixQuery)).toBe(true);
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
