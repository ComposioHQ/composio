/**
 * CLI `composio dev toolkits list` e2e test
 *
 * Verifies that the list subcommand returns toolkits as JSON in piped mode
 * and applies exact, prefix, and non-fuzzy query behavior against a toolkit
 * discovered from the current environment.
 */

import { e2e, sanitizeOutput, parseJsonStdout, type E2ETestResult } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect, beforeAll } from 'bun:test';

declare module 'bun' {
  interface Env {
    COMPOSIO_USER_API_KEY: string;
  }
}

type ToolkitCandidate = {
  name: string;
  slug: string;
  prefixQuery: string;
  typoQuery: string;
};

const pickToolkitCandidate = (result: E2ETestResult): ToolkitCandidate => {
  const items = parseJsonStdout(result) as Array<{
    name: string;
    slug: string;
    tools_count?: number;
  }>;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Expected `composio dev toolkits list --limit 50` to return at least 1 item');
  }

  const preferred =
    items.find(item => item.slug.length >= 4 && (item.tools_count ?? 0) > 0) ??
    items.find(item => item.slug.length >= 4) ??
    items[0];

  const typoQuery =
    preferred.slug.length < 4
      ? `${preferred.slug}__definitely_not_present__`
      : (() => {
          const middleIndex = Math.floor(preferred.slug.length / 2);
          const replacement = preferred.slug[middleIndex] === 'z' ? '0' : 'z';
          return (
            preferred.slug.slice(0, middleIndex) +
            replacement +
            preferred.slug.slice(middleIndex + 1)
          );
        })();

  return {
    name: preferred.name,
    slug: preferred.slug,
    prefixQuery:
      preferred.slug.length > 1 ? preferred.slug.slice(0, preferred.slug.length - 1) : preferred.slug,
    typoQuery,
  };
};

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  env: {
    COMPOSIO_USER_API_KEY: Bun.env.COMPOSIO_USER_API_KEY,
  },
  defineTests: ({ runCmd }) => {
    let seedResult: E2ETestResult;
    let exactResult: E2ETestResult;
    let prefixResult: E2ETestResult;
    let noFuzzyResult: E2ETestResult;
    let candidate: ToolkitCandidate;

    beforeAll(async () => {
      seedResult = await runCmd('composio dev toolkits list --limit 50');
      candidate = pickToolkitCandidate(seedResult);

      [exactResult, prefixResult, noFuzzyResult] = await Promise.all([
        runCmd(`composio dev toolkits list --query ${candidate.slug} --limit 1`),
        runCmd(`composio dev toolkits list --query ${candidate.prefixQuery} --limit 10`),
        runCmd(`composio dev toolkits list --query ${candidate.typoQuery} --limit 10`),
      ]);
    }, TIMEOUTS.FIXTURE * 2);

    describe('composio dev toolkits list --limit 50 (seed query)', () => {
      it('exits successfully', () => {
        expect(seedResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(seedResult.stderr).toBe('');
      });

      it('stdout contains at least 1 toolkit', () => {
        const items = parseJsonStdout(seedResult);
        expect(Array.isArray(items)).toBe(true);
        expect((items as Array<unknown>).length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('composio dev toolkits list --query <slug> --limit 1 (exact slug)', () => {
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

      it('the element has the discovered slug', () => {
        const items = parseJsonStdout(exactResult) as Array<{ slug: string }>;
        expect(items[0].slug).toBe(candidate.slug);
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

    describe('composio dev toolkits list --query <prefix> --limit 10 (prefix search)', () => {
      it('exits successfully', () => {
        expect(prefixResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(prefixResult.stderr).toBe('');
      });

      it('stdout contains the discovered toolkit', () => {
        const items = parseJsonStdout(prefixResult);
        expect(Array.isArray(items)).toBe(true);
        expect((items as Array<{ slug: string }>).some(item => item.slug === candidate.slug)).toBe(
          true
        );
      });
    });

    describe('composio dev toolkits list --query <typo> --limit 10 (no fuzzy search)', () => {
      it('exits successfully', () => {
        expect(noFuzzyResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(noFuzzyResult.stderr).toBe('');
      });

      it('stdout does not include the discovered toolkit', () => {
        const items = JSON.parse(sanitizeOutput(noFuzzyResult.stdout)) as Array<{ slug: string }>;
        expect(Array.isArray(items)).toBe(true);
        expect(items.some(item => item.slug === candidate.slug)).toBe(false);
      });
    });
  },
});
