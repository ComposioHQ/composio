/**
 * OpenAI v6 + Zod v4 compatibility e2e test
 *
 * Verifies that @composio/core works correctly with openai@6 and zod@4,
 * specifically testing the fix for https://github.com/ComposioHQ/composio/issues/2336
 */

import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

declare module 'bun' {
  interface Env {
    COMPOSIO_API_KEY: string;
  }
}

e2e(import.meta.url, {
  nodeVersions: ['20.19.0', '22.12.0'],
  env: {
    COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
  },
  defineTests: ({ runCmd }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runCmd(
        'npm --prefix fixtures install --legacy-peer-deps && node fixtures/index.mjs'
      );
    });

    describe('setup', () => {
      it('npm install completes successfully', () => {
        expect(result.stdout).toMatch(/added \d+ packages/);
      });
    });

    describe('OpenAI v6 + Zod v4 compatibility', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('zod@4 works', () => {
        expect(result.stdout).toContain('zod@4 works');
      });

      it('openai@5 works', () => {
        expect(result.stdout).toContain('openai@5 works');
      });

      it('@composio/core works', () => {
        expect(result.stdout).toContain('@composio/core works');
      });

      it('wrapTool works', () => {
        expect(result.stdout).toContain('wrapTool works');
      });

      it('all packages work together', () => {
        expect(result.stdout).toContain('All packages work together!');
      });
    },);
  },
});
