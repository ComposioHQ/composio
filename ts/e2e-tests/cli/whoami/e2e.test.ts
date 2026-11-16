/**
 * CLI whoami command e2e test
 *
 * Verifies, against a mock Composio API, that the compiled composio CLI prints the account
 * of an accepted user API key as JSON, and fails with how to recover for a rejected one.
 */

import {
  e2e,
  parseJsonStdout,
  type E2ETestResult,
  type E2ETestResultWithFiles,
} from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  ACCEPTED_USER_API_KEY,
  REJECTED_USER_API_KEY,
  SESSION_INFO,
  startMockWhoamiServer,
  type MockWhoamiServer,
} from '../../../packages/cli/scripts/mock-whoami-server';

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    let server: MockWhoamiServer;
    let whoamiResult: E2ETestResult;
    let redirectedResult: E2ETestResultWithFiles<'out.txt'>;
    let rejectedResult: E2ETestResult;

    const expectedWhoami = {
      account_type: 'human',
      email: SESSION_INFO.org_member.email,
      current_org_name: SESSION_INFO.project.org.name,
      enhanced_controls_enabled: false,
    };

    beforeAll(async () => {
      server = await startMockWhoamiServer();

      const envPrefix = (userApiKey: string) =>
        [
          `COMPOSIO_BASE_URL=${server.dockerBaseUrl}`,
          'COMPOSIO_CACHE_DIR=/tmp/composio-whoami',
          `COMPOSIO_USER_API_KEY=${userApiKey}`,
        ].join(' ');

      whoamiResult = await runCmd(`${envPrefix(ACCEPTED_USER_API_KEY)} composio whoami`);
      redirectedResult = await runCmd({
        command: `${envPrefix(ACCEPTED_USER_API_KEY)} composio whoami > out.txt`,
        files: ['out.txt'],
      });
      rejectedResult = await runCmd(`${envPrefix(REJECTED_USER_API_KEY)} composio whoami`);
    }, TIMEOUTS.FIXTURE);

    afterAll(async () => {
      await server.close();
    });

    describe('composio whoami (accepted key)', () => {
      it('exits successfully', () => {
        expect(whoamiResult.exitCode).toBe(0);
      });

      it('stdout is the account as JSON', () => {
        expect(parseJsonStdout(whoamiResult)).toEqual(expectedWhoami);
      });

      it('stderr is empty', () => {
        expect(whoamiResult.stderr).toBe('');
      });
    });

    describe('stdout redirection to out.txt (accepted key)', () => {
      it('exits successfully', () => {
        expect(redirectedResult.exitCode).toBe(0);
      });

      it('stdout is empty', () => {
        expect(redirectedResult.stdout).toBe('');
      });

      it('stderr is empty', () => {
        expect(redirectedResult.stderr).toBe('');
      });

      it('out.txt holds the account as JSON', () => {
        expect(JSON.parse(redirectedResult.files['out.txt'])).toEqual(expectedWhoami);
      });
    });

    describe('composio whoami (key rejected with 401)', () => {
      it('exits with code 1', () => {
        expect(rejectedResult.exitCode).toBe(1);
      });

      it('stdout is empty', () => {
        expect(rejectedResult.stdout).toBe('');
      });

      it('stderr names the rejection', () => {
        expect(rejectedResult.stderr).toContain('Invalid or revoked user API key');
      });

      it('stderr says to replace the key in COMPOSIO_USER_API_KEY', () => {
        expect(rejectedResult.stderr).toContain(
          'Replace the key in COMPOSIO_USER_API_KEY, then retry.'
        );
      });
    });

    describe('mock API usage', () => {
      it('reads the session info with each key', () => {
        expect(server.requests).toContain(
          `GET /api/v3.1/auth/session/info ${ACCEPTED_USER_API_KEY}`
        );
        expect(server.requests).toContain(
          `GET /api/v3.1/auth/session/info ${REJECTED_USER_API_KEY}`
        );
      });
    });
  },
});
