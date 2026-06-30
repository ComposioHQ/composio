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
  versions: { node: ['22.22.3', '24.17.0', '25.9.0'] },
  usesFixtures: true,
  env: {
    COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
  },
  defineTests: ({ runFixture }) => {
    let result: E2ETestResult;
    const isStorageUnavailable = () =>
      result.stdout.includes('UPLOAD_UNAVAILABLE') || result.stdout.includes('FILES_MOUNT_UNAVAILABLE');

    beforeAll(async () => {
      result = await runFixture({ filename: 'index.mjs' });
    }, 120_000);

    describe('Tool Router session files', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('upload succeeds or is explicitly unavailable', () => {
        expect(result.stdout).toMatch(/UPLOAD_OK|UPLOAD_UNAVAILABLE|FILES_MOUNT_UNAVAILABLE/);
      });

      it('list succeeds', () => {
        if (isStorageUnavailable()) {
          expect(result.stdout).toMatch(/LIST_SKIP|storage authorization failed/);
          return;
        }
        expect(result.stdout).toMatch(/LIST_OK|LIST_SKIP/);
      });

      it('download succeeds or is skipped after unavailable upload', () => {
        if (isStorageUnavailable()) {
          expect(result.stdout).toMatch(/DOWNLOAD_SKIP|storage authorization failed/);
          return;
        }
        expect(result.stdout).toContain('DOWNLOAD_OK');
      });

      it('delete succeeds or is skipped after unavailable upload', () => {
        if (isStorageUnavailable()) {
          expect(result.stdout).toMatch(/DELETE_SKIP|storage authorization failed/);
          return;
        }
        expect(result.stdout).toContain('DELETE_OK');
      });

      it('all operations complete or are explicitly skipped', () => {
        if (isStorageUnavailable()) {
          expect(result.stdout).toMatch(/ALL_SKIP|storage authorization failed/);
          return;
        }
        expect(result.stdout).toContain('ALL_OK');
      });
    });
  },
});
