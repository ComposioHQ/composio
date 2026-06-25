import { e2e, type E2ETestResult, type DefineTestsContext } from '@e2e-tests/utils';
import { describe, it, expect, beforeAll } from 'bun:test';

declare module 'bun' {
  interface Env {
    COMPOSIO_API_KEY: string;
  }
}

const formatFixtureResult = (result: E2ETestResult): string =>
  [
    `exitCode=${result.exitCode}`,
    '',
    '[stdout]',
    result.stdout.trim() || '(empty)',
    '',
    '[stderr]',
    result.stderr.trim() || '(empty)',
  ].join('\n');

const expectFixtureExitCode = (result: E2ETestResult, expectedExitCode: number): void => {
  if (result.exitCode !== expectedExitCode) {
    throw new Error(`file-roundtrip fixture failed\n${formatFixtureResult(result)}`);
  }
};

e2e(import.meta.url, {
  versions: { node: ['22.22.3', '24.17.0', '25.9.0'] },
  usesFixtures: true,
  env: {
    COMPOSIO_API_KEY: Bun.env.COMPOSIO_API_KEY,
  },
  defineTests: ({ runFixture }: DefineTestsContext) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'test.mjs' });
    }, 300_000);

    describe('file round-trip', () => {
      it('exits successfully', () => {
        expectFixtureExitCode(result, 0);
      });

      it('reports upload outcome', () => {
        // Accept either full round-trip or upload-only success
        // (download or external storage upload auth may be unavailable)
        const hasRoundTripOk = result.stdout.includes('ROUND_TRIP_OK');
        const hasUploadOk = result.stdout.includes('UPLOAD_OK');
        const hasUploadUnavailable = result.stdout.includes('UPLOAD_UNAVAILABLE');
        expect(hasRoundTripOk || hasUploadOk || hasUploadUnavailable, formatFixtureResult(result)).toBe(true);
      });

      it('includes sha256 checksum', () => {
        expect(result.stdout, formatFixtureResult(result)).toContain('sha256=');
      });
    });
  },
});
