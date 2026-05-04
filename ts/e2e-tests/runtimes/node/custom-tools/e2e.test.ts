/**
 * Custom local tools E2E test.
 *
 * Verifies local tool execution, Zod validation, session context, error handling,
 * mixed local+remote chaining, and edge cases against the live Composio API.
 * Uses weathermap toolkit (no auth needed).
 * Requires COMPOSIO_API_KEY in environment.
 */

import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

declare module 'bun' {
  interface Env {
    COMPOSIO_API_KEY: string;
  }
}

e2e(import.meta.url, {
  versions: { node: ['20.19.0', '22.12.0'] },
  usesFixtures: true,
  env: {
    COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
  },
  defineTests: ({ runFixture }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'index.mjs' });
    }, 120_000);

    describe('Custom local tools', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('single local tool execution works', () => {
        expect(result.stdout).toContain('LOCAL_EXECUTE_OK');
      });

      it('Zod defaults are applied', () => {
        expect(result.stdout).toContain('ZOD_DEFAULTS_OK');
      });

      it('error thrown by tool is wrapped into { data, error }', () => {
        expect(result.stdout).toContain('ERROR_HANDLING_OK');
      });

      it('Zod validation failure returns error, does not crash', () => {
        expect(result.stdout).toContain('ZOD_VALIDATION_FAIL_OK');
      });

      it('multiple local tools route to correct execute fn', () => {
        expect(result.stdout).toContain('MULTIPLE_TOOLS_OK');
      });

      it('session context injects userId', () => {
        expect(result.stdout).toContain('SESSION_CONTEXT_OK');
      });

      it('case-insensitive slug works', () => {
        expect(result.stdout).toContain('CASE_INSENSITIVE_OK');
      });

      it('prefixed slug (LOCAL_) works', () => {
        expect(result.stdout).toContain('PREFIXED_SLUG_OK');
      });

      it('local tool chains into remote tool via SessionContext.execute()', () => {
        expect(result.stdout).toContain('CHAINED_EXECUTE_OK');
      });

      it('non-existent tool returns error gracefully', () => {
        expect(result.stdout).toContain('NONEXISTENT_TOOL_OK');
      });

      it('session.tools() wrapping works', () => {
        expect(result.stdout).toContain('TOOLS_WRAPPING_OK');
      });

      it('all operations complete', () => {
        expect(result.stdout).toContain('ALL_OK');
      });
    });
  },
});
