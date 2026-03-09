/**
 * Tool Router session files mount E2E test.
 *
 * Verifies list, upload, download, and delete operations against the live Composio API.
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

    describe('Tool Router session files', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('upload succeeds', () => {
        expect(result.stdout).toContain('UPLOAD_OK');
      });

      it('list succeeds', () => {
        expect(result.stdout).toMatch(/LIST_OK|LIST_SKIP/);
      });

      it('download succeeds', () => {
        expect(result.stdout).toContain('DOWNLOAD_OK');
      });

      it('delete succeeds', () => {
        expect(result.stdout).toContain('DELETE_OK');
      });

      it('all operations complete', () => {
        expect(result.stdout).toContain('ALL_OK');
      });
    });
  },
});
