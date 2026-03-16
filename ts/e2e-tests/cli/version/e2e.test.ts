/**
 * CLI version command e2e test
 *
 * Verifies that the compiled composio CLI behaves correctly in a scratch container.
 */

import { e2e, sanitizeOutput, type E2ETestResult, type E2ETestResultWithFiles } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect, beforeAll } from 'bun:test';
import cliPkg from '../../../packages/cli/package.json' with { type: 'json' };

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    const expectedVersion = String(cliPkg.version ?? '').trim();
    let versionResult: E2ETestResult;
    let redirectedResult: E2ETestResultWithFiles<'out.txt'>;

    beforeAll(async () => {
      versionResult = await runCmd('composio version');
      redirectedResult = await runCmd({
        command: 'composio version > out.txt',
        files: ['out.txt'],
      });
    }, TIMEOUTS.FIXTURE);

    describe('composio version', () => {
      it('exits successfully', () => {
        expect(versionResult.exitCode).toBe(0);
      });

      it('stdout matches snapshot', () => {
        expect(sanitizeOutput(versionResult.stdout)).toBe(expectedVersion);
      });

      it('stderr matches snapshot', () => {
        expect(versionResult.stderr).toBe('');
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

      it('out.txt matches snapshot', () => {
        expect(sanitizeOutput(redirectedResult.files['out.txt'])).toBe(expectedVersion);
      });
    });
  },
});
