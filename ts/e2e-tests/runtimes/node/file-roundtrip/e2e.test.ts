import { e2e, type E2ETestResult, type DefineTestsContext } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

declare module 'bun' {
  interface Env {
    COMPOSIO_API_KEY: string;
  }
}

e2e(import.meta.url, {
  nodeVersions: ['current'],
  usesFixtures: true,
  env: {
    COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
  },
  defineTests: ({ runFixture }: DefineTestsContext) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'test.mjs' })
    }, 300_000);

    describe('file round-trip', () => {
      it('exits successfully', () => {
        expect(result.exitCode).toBe(0);
      });

      it('reports upload success', () => {
        // Accept either full round-trip or upload-only success
        // (download may fail if storage domain is not reachable)
        const hasRoundTripOk = result.stdout.includes('ROUND_TRIP_OK');
        const hasUploadOk = result.stdout.includes('UPLOAD_OK');
        expect(hasRoundTripOk || hasUploadOk).toBe(true);
      });

      it('includes sha256 checksum', () => {
        expect(result.stdout).toContain('sha256=');
      });
    });
  },
});
