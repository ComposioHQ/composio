/**
 * Tool Router session.toolkits() cursor pagination E2E test.
 *
 * Regression test for PLEN-1886: the SDK was silently dropping the `cursor`
 * input, so every call returned page 1. This test fails fast if that
 * behavior ever regresses.
 *
 * Project-agnostic: relies on the global toolkit catalog (hundreds of
 * toolkits), so `limit: 2` always yields multiple pages regardless of
 * which Composio project is on CI.
 *
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

    describe('session.toolkits pagination', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('page 1 returns items and a cursor', () => {
        expect(result.stdout).toContain('PAGE1_OK');
      });

      it('page 2 returns items', () => {
        expect(result.stdout).toContain('PAGE2_OK');
      });

      it('pagination advances past page 1', () => {
        expect(result.stdout).toContain('ADVANCED_OK');
      });

      it('all operations complete', () => {
        expect(result.stdout).toContain('ALL_OK');
      });
    });
  },
});
