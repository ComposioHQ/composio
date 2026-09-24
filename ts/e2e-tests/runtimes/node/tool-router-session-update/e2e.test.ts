/**
 * Tool Router session.update() E2E test.
 *
 * Regression test for @composio/core 0.20.0, where update() sent
 * `expected_config_version` by default and the live API rejected every call
 * with a 400. Unit tests mock the transport and cannot catch a payload the API
 * refuses, so this test sends a default update to the real API.
 *
 * Project-agnostic: creates its own session and deletes it afterwards.
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
  versions: { node: ['current'] },
  usesFixtures: true,
  env: {
    COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
  },
  defineTests: ({ runFixture }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'index.mjs' });
    }, 120_000);

    describe('session.update with default options', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('creates a session', () => {
        expect(result.stdout).toContain('CREATE_OK');
      });

      it('applies the update and advances configVersion', () => {
        expect(result.stdout).toContain('UPDATE_OK');
      });

      it('persists the update on the server', () => {
        expect(result.stdout).toContain('PERSISTED_OK');
      });

      it('deletes the session', () => {
        expect(result.stdout).toContain('DELETE_OK');
      });

      it('all operations complete', () => {
        expect(result.stdout).toContain('ALL_OK');
      });
    });
  },
});
