/**
 * Core tool execution E2E test for Deno.
 *
 * The `esm-basic` suite proves `@composio/core` imports under Deno;
 * this suite proves the runtime works there — session creation over
 * fetch, custom-tool registration, Zod validation, and in-process
 * local tool execution on the Effect v4 build.
 *
 * Requires COMPOSIO_API_KEY in the environment (CI provides it; the
 * runner passes it into the container).
 */

import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect, beforeAll } from 'bun:test';

declare module 'bun' {
  interface Env {
    COMPOSIO_API_KEY: string;
  }
}

e2e(import.meta.url, {
  versions: {
    deno: ['2.6.7'],
  },
  usesFixtures: true,
  env: {
    COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
  },
  defineTests: ({ runFixture }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'test.ts' });
    }, TIMEOUTS.FIXTURE);

    describe('Core tool execution (Deno)', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('creates a session over fetch', () => {
        expect(result.stdout).toContain('SESSION_CREATE_OK');
      });

      it('executes a local custom tool', () => {
        expect(result.stdout).toContain('LOCAL_EXECUTE_OK');
      });

      it('applies Zod defaults', () => {
        expect(result.stdout).toContain('ZOD_DEFAULTS_OK');
      });

      it('wraps a thrown tool error into { data, error }', () => {
        expect(result.stdout).toContain('ERROR_HANDLING_OK');
      });

      it('surfaces Zod validation failures as errors', () => {
        expect(result.stdout).toContain('ZOD_VALIDATION_FAIL_OK');
      });

      it('routes multiple local tools to the right execute fn', () => {
        expect(result.stdout).toContain('MULTIPLE_TOOLS_OK');
      });

      it('injects session context (userId)', () => {
        expect(result.stdout).toContain('SESSION_CONTEXT_OK');
      });

      it('matches slugs case-insensitively', () => {
        expect(result.stdout).toContain('CASE_INSENSITIVE_OK');
      });

      it('resolves LOCAL_-prefixed slugs', () => {
        expect(result.stdout).toContain('PREFIXED_SLUG_OK');
      });

      it('completes all tests', () => {
        expect(result.stdout).toContain('ALL_OK');
      });
    });
  },
});
