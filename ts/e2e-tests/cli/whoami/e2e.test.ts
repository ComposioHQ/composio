/**
 * CLI whoami command e2e test
 *
 * Verifies that the compiled composio CLI prints the API key in a scratch container.
 */

import { e2e, sanitizeOutput, type E2ETestResult, type E2ETestResultWithFiles } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect, beforeAll } from 'bun:test';

declare module 'bun' {
  interface Env {
    COMPOSIO_USER_API_KEY: string;
  }
}

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  env: {
    COMPOSIO_USER_API_KEY: Bun.env.COMPOSIO_USER_API_KEY,
  },
  defineTests: ({ runCmd }) => {
    const expectedApiKey = Bun.env.COMPOSIO_USER_API_KEY.trim();
    let whoamiResult: E2ETestResult;
    let redirectedResult: E2ETestResultWithFiles<'out.txt'>;

    beforeAll(async () => {
      whoamiResult = await runCmd('composio whoami');
      redirectedResult = await runCmd({
        command: 'composio whoami > out.txt',
        files: ['out.txt'],
      });
    }, TIMEOUTS.FIXTURE);

    describe('composio whoami', () => {
      it('exits successfully', () => {
        expect(whoamiResult.exitCode).toBe(0);
      });

      it('stdout contains the API key', () => {
        expect(sanitizeOutput(whoamiResult.stdout)).toBe(expectedApiKey);
      });

      it('stderr is empty', () => {
        expect(whoamiResult.stderr).toBe('');
      });
    });

    describe('stdout redirection to out.txt', () => {
      it('exits successfully', () => {
        expect(redirectedResult.exitCode).toBe(0);
      });

      it('stdout is empty', () => {
        expect(redirectedResult.stdout).toBe('');
      });

      it('stderr is empty', () => {
        expect(redirectedResult.stderr).toBe('');
      });

      it('out.txt contains the API key', () => {
        expect(sanitizeOutput(redirectedResult.files['out.txt'])).toBe(expectedApiKey);
      });
    });
  },
});
