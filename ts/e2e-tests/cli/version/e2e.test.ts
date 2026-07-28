/**
 * CLI version command e2e test
 *
 * Verifies that the compiled composio CLI behaves correctly in a scratch container.
 */

import {
  e2e,
  parseJsonStdout,
  sanitizeOutput,
  type E2ETestResult,
  type E2ETestResultWithFiles,
} from '@e2e-tests/utils';
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
    let updateAvailableResult: E2ETestResult;
    let unknownStatusResult: E2ETestResult;
    let redirectedResult: E2ETestResultWithFiles<'out.txt'>;

    beforeAll(async () => {
      versionResult = await runCmd('composio version');
      updateAvailableResult = await runCmd(
        `mkdir -p .composio && printf '%s' '{"lastChecked":"2099-01-01T00:00:00.000Z","latestVersion":"99.0.0"}' > .composio/update-check.json && HOME="$PWD" composio version --check`
      );
      unknownStatusResult = await runCmd(
        `mkdir -p .composio && printf '%s' '{"lastAttempted":"2099-01-01T00:00:00.000Z"}' > .composio/update-check.json.attempt && HOME="$PWD" composio version --check`
      );
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

    describe('composio version --check with a known update', () => {
      it('exits successfully with clean machine-readable output', () => {
        expect(updateAvailableResult.exitCode).toBe(0);
        expect(updateAvailableResult.stderr).toBe('');
        expect(parseJsonStdout(updateAvailableResult)).toEqual({
          current: expectedVersion,
          latestStable: '99.0.0',
          updateAvailable: true,
          checkStatus: 'update-available',
          lastChecked: '2099-01-01T00:00:00.000Z',
        });
      });
    });

    describe('composio version --check when the latest release is unknown', () => {
      it('exits successfully without claiming the current version is up to date', () => {
        expect(unknownStatusResult.exitCode).toBe(0);
        expect(unknownStatusResult.stderr).toBe('');
        expect(parseJsonStdout(unknownStatusResult)).toEqual({
          current: expectedVersion,
          latestStable: null,
          updateAvailable: false,
          checkStatus: 'unknown',
          lastChecked: null,
        });
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
