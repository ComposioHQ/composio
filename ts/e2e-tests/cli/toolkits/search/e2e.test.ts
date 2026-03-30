/**
 * CLI `composio dev toolkits search` e2e test
 *
 * Verifies that the search subcommand returns matching toolkits as JSON in piped mode,
 * respects --limit, supports stdout redirection, and handles no-result queries
 * against a toolkit discovered from the current environment.
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

type ToolkitCandidate = {
  name: string;
  slug: string;
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

  return {
    name: preferred.name,
    slug: preferred.slug,
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
    let validResult: E2ETestResult;
    let limitResult: E2ETestResult;
    let redirectResult: E2ETestResultWithFiles<'out.json'>;
    let noResultsResult: E2ETestResult;
    let candidate: ToolkitCandidate;

    beforeAll(async () => {
      seedResult = await runCmd('composio dev toolkits list --limit 50');
      candidate = pickToolkitCandidate(seedResult);

      [validResult, limitResult, redirectResult, noResultsResult] = await Promise.all([
        runCmd(`composio dev toolkits search ${candidate.slug}`),
        runCmd(`composio dev toolkits search ${candidate.slug} --limit 1`),
        runCmd({
          command: `composio dev toolkits search ${candidate.slug} --limit 1 > out.json`,
          files: ['out.json'],
        }),
        runCmd('composio dev toolkits search xyznonexistent_abc_12345'),
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

    describe('composio dev toolkits search <slug> (discovered query)', () => {
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

      it('first element has the discovered slug', () => {
        const items = parseJsonStdout(validResult) as Array<{ slug: string }>;
        expect(items[0].slug).toBe(candidate.slug);
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

    describe('composio dev toolkits search <slug> --limit 1 (with limit)', () => {
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

      it('the element has the discovered slug', () => {
        const items = parseJsonStdout(limitResult) as Array<{ slug: string }>;
        expect(items[0].slug).toBe(candidate.slug);
      });
    });

    describe(
      'composio dev toolkits search <slug> --limit 1 > out.json (stdout redirection)',
      () => {
      it('exits successfully', () => {
        expect(redirectResult.exitCode).toBe(0);
      });

      it('stdout is empty', () => {
        expect(redirectResult.stdout).toBe('');
      });

      it('stderr is empty', () => {
        expect(redirectResult.stderr).toBe('');
      });

      it('out.json contains a JSON array with the discovered slug', () => {
        const items = JSON.parse(sanitizeOutput(redirectResult.files['out.json']));
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(1);
        expect(items[0].slug).toBe(candidate.slug);
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
