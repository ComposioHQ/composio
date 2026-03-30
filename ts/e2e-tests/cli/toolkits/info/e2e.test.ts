/**
 * CLI `composio dev toolkits info` e2e test
 *
 * Verifies that the info subcommand returns detailed toolkit JSON in piped mode,
 * handles invalid slugs gracefully, and supports stdout redirection
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
    let redirectResult: E2ETestResultWithFiles<'out.json'>;
    let invalidResult: E2ETestResult;
    let missingSlugResult: E2ETestResult;
    let candidate: ToolkitCandidate;

    beforeAll(async () => {
      seedResult = await runCmd('composio dev toolkits list --limit 50');
      candidate = pickToolkitCandidate(seedResult);

      validResult = await runCmd(`composio dev toolkits info ${candidate.slug}`);
      redirectResult = await runCmd({
        command: `composio dev toolkits info ${candidate.slug} > out.json`,
        files: ['out.json'],
      });
      invalidResult = await runCmd('composio dev toolkits info nonexistent_toolkit_xyz12345');
      missingSlugResult = await runCmd('composio dev toolkits info');
    }, TIMEOUTS.FIXTURE);

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

    describe('composio dev toolkits info <slug> (valid slug)', () => {
      it('exits successfully', () => {
        expect(validResult.exitCode).toBe(0);
      });

      it('stderr is empty', () => {
        expect(validResult.stderr).toBe('');
      });

      it('stdout is a valid JSON object', () => {
        const obj = parseJsonStdout(validResult);
        expect(typeof obj).toBe('object');
        expect(Array.isArray(obj)).toBe(false);
      });

      it('has the discovered name and slug', () => {
        const obj = parseJsonStdout(validResult) as Record<string, unknown>;
        expect(obj.name).toBe(candidate.name);
        expect(obj.slug).toBe(candidate.slug);
      });

      it('has meta with description and logo', () => {
        const obj = parseJsonStdout(validResult) as Record<string, Record<string, unknown>>;
        expect(obj.meta).toHaveProperty('description');
        expect(typeof obj.meta.description).toBe('string');
        expect(obj.meta).toHaveProperty('logo');
      });

      it('has is_no_auth and enabled', () => {
        const obj = parseJsonStdout(validResult) as Record<string, unknown>;
        expect(typeof obj.is_no_auth).toBe('boolean');
        expect(typeof obj.enabled).toBe('boolean');
      });

      it('has composio_managed_auth_schemes array', () => {
        const obj = parseJsonStdout(validResult) as Record<string, unknown>;
        expect(Array.isArray(obj.composio_managed_auth_schemes)).toBe(true);
      });

      it('has connected_account (object or null)', () => {
        const obj = parseJsonStdout(validResult) as Record<string, unknown>;
        expect(obj).toHaveProperty('connected_account');
      });
    });

    describe('composio dev toolkits info <slug> > out.json (stdout redirection)', () => {
      it('exits successfully', () => {
        expect(redirectResult.exitCode).toBe(0);
      });

      it('stdout is empty', () => {
        expect(redirectResult.stdout).toBe('');
      });

      it('stderr is empty', () => {
        expect(redirectResult.stderr).toBe('');
      });

      it('out.json contains valid JSON with the discovered slug', () => {
        const content = redirectResult.files['out.json'];
        const obj = JSON.parse(sanitizeOutput(content));
        expect(obj.slug).toBe(candidate.slug);
      });
    });

    describe('composio dev toolkits info nonexistent_toolkit_xyz12345 (invalid slug)', () => {
      it('exits successfully (graceful error handling)', () => {
        expect(invalidResult.exitCode).toBe(0);
      });

      it('stdout is empty (no data on error)', () => {
        expect(sanitizeOutput(invalidResult.stdout)).toBe('');
      });

      it('stderr is empty (piped mode suppresses decoration)', () => {
        expect(invalidResult.stderr).toBe('');
      });
    });

    describe('composio dev toolkits info (missing slug)', () => {
      it('exits successfully (optional arg, handler guards)', () => {
        expect(missingSlugResult.exitCode).toBe(0);
      });

      it('stdout is empty', () => {
        expect(sanitizeOutput(missingSlugResult.stdout)).toBe('');
      });

      it('stderr is empty', () => {
        expect(missingSlugResult.stderr).toBe('');
      });
    });
  },
});
