/**
 * Tool Router proxyExecute session option E2E test.
 *
 * Unit tests mock the transport, so they cannot tell whether the API accepts
 * the proxy_execute block, stores it, or lists the COMPOSIO_PROXY_EXECUTE meta
 * tool. This test sends the real requests.
 *
 * Project-agnostic: creates its own sessions and deletes them afterwards.
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
    }, 180_000);

    describe('proxyExecute session option', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('create(true) stores the block and lists the meta tool', () => {
        expect(result.stdout).toContain('CREATE_ON_OK');
      });

      it('update(false) stores the block and hides the meta tool', () => {
        expect(result.stdout).toContain('UPDATE_OFF_OK');
      });

      it('update with the block form, then null removes it', () => {
        expect(result.stdout).toContain('UPDATE_NULL_OK');
      });

      it('create() leaves the option unset', () => {
        expect(result.stdout).toContain('DEFAULT_OK');
      });

      it('rejects false together with sandbox.enableProxyExecution', () => {
        expect(result.stdout).toContain('CONFLICT_REJECTED_OK');
      });

      it('deletes the sessions', () => {
        expect(result.stdout).toContain('DELETE_OK');
      });

      it('all operations complete', () => {
        expect(result.stdout).toContain('ALL_OK');
      });
    });
  },
});
