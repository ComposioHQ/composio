/**
 * CLI `composio dev toolkits list` e2e test
 *
 * Verifies that the list subcommand returns toolkits as JSON in piped mode
 * and applies exact and non-fuzzy query behavior against a toolkit
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
  typoQuery: string;
};

const TOOLKIT_CANDIDATES = [
  'hackernews',
  'github',
  'gmail',
  'slack',
  'notion',
  'linear',
  'discord',
  'googlecalendar',
  'googledocs',
  'hubspot',
] as const;

const discoverToolkitCandidate = async (
  runCmd: (command: string) => Promise<E2ETestResult>
): Promise<ToolkitCandidate> => {
  for (const slug of TOOLKIT_CANDIDATES) {
    const result = await runCmd(`composio dev toolkits info ${slug}`);

    if (result.exitCode !== 0 || sanitizeOutput(result.stdout) === '') {
      continue;
    }

    const item = parseJsonStdout(result) as { name?: string; slug?: string };
    if (item.slug !== slug || typeof item.name !== 'string') {
      continue;
    }

    const typoQuery =
      slug.length < 4
        ? `${slug}__definitely_not_present__`
        : (() => {
            const middleIndex = Math.floor(slug.length / 2);
            const replacement = slug[middleIndex] === 'z' ? '0' : 'z';
            return slug.slice(0, middleIndex) + replacement + slug.slice(middleIndex + 1);
          })();

    return {
      name: item.name,
      slug,
      typoQuery,
    };
  }

  throw new Error(
    `Expected one of these toolkit slugs to resolve: ${TOOLKIT_CANDIDATES.join(', ')}`
  );
};

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  env: {
    COMPOSIO_USER_API_KEY: Bun.env.COMPOSIO_USER_API_KEY,
  },
  defineTests: ({ runCmd }) => {
    let exactResult: E2ETestResult;
    let noFuzzyResult: E2ETestResult;
    let candidate: ToolkitCandidate;

    beforeAll(async () => {
      candidate = await discoverToolkitCandidate(runCmd);

      [exactResult, noFuzzyResult] = await Promise.all([
        runCmd(`composio dev toolkits list --query ${candidate.slug} --limit 1`),
        runCmd(`composio dev toolkits list --query ${candidate.typoQuery} --limit 10`),
      ]);
    }, TIMEOUTS.FIXTURE * 2);

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
