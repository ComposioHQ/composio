/**
 * CLI agent sign-in e2e test (PRDE-1138)
 *
 * A headless agent must reach an authenticated CLI without human action, and
 * a human piping `composio login` must never be auto-signed-up as an agent.
 */

import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  startMockAgentsServer,
  type MockAgentsServer,
} from '../../../packages/cli/scripts/mock-agents-server';

const CACHE_DIR = '/tmp/composio-agent-signin';

/** Parses the last stdout line as JSON — the `composio whoami` payload. */
const lastJsonLine = (stdout: string): Record<string, unknown> =>
  JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as Record<string, unknown>;

/** Extracts the text a `runCmd` script printed between two markers. */
const section = (stdout: string, marker: string): string =>
  stdout.split(`---${marker}---`).at(1)?.split('---').at(0)?.trim() ?? '';

const envPrefix = (server: MockAgentsServer): string =>
  [
    `COMPOSIO_BASE_URL=${server.dockerBaseUrl}`,
    `COMPOSIO_AGENTS_BASE_URL=${server.dockerBaseUrl}`,
    `COMPOSIO_CACHE_DIR=${CACHE_DIR}`,
  ].join(' ');

e2e(import.meta.url, {
  versions: {
    cli: ['current'],
  },
  defineTests: ({ runCmd }) => {
    let signupServer: MockAgentsServer;
    let guardrailServer: MockAgentsServer;
    let reuseServer: MockAgentsServer;
    let fallbackServer: MockAgentsServer;
    let unattendedSignup: E2ETestResult;
    let headlessHumanLogin: E2ETestResult;
    let storedIdentityLogin: E2ETestResult;
    let plaintextFallback: E2ETestResult;

    beforeAll(async () => {
      signupServer = await startMockAgentsServer();
      guardrailServer = await startMockAgentsServer();
      reuseServer = await startMockAgentsServer();
      fallbackServer = await startMockAgentsServer();

      unattendedSignup = await runCmd(
        `${envPrefix(signupServer)} composio login --agent --no-skill-install && ${envPrefix(signupServer)} composio whoami`
      );

      headlessHumanLogin = await runCmd(`${envPrefix(guardrailServer)} composio login`);

      const storedIdentity = JSON.stringify(reuseServer.agentIdentity);
      storedIdentityLogin = await runCmd(
        [
          `mkdir -p ${CACHE_DIR}`,
          `printf '%s' '${storedIdentity}' > ${CACHE_DIR}/agent.json`,
          `${envPrefix(reuseServer)} composio login && ${envPrefix(reuseServer)} composio whoami`,
        ].join('\n')
      );

      // This container is Debian with no Secret Service daemon, so the
      // credential store is unreachable and the CLI must fall back to a
      // plaintext key. Login and whoami are separate CLI processes, so a
      // fallback that only lived in memory would not survive to the second.
      plaintextFallback = await runCmd(
        [
          `${envPrefix(fallbackServer)} composio login --agent --no-skill-install`,
          `echo '---USER-DATA---'`,
          `cat ${CACHE_DIR}/user_data.json`,
          `echo`,
          `echo '---MODE---'`,
          `stat -c '%a' ${CACHE_DIR}/user_data.json`,
          `echo '---WHOAMI---'`,
          `${envPrefix(fallbackServer)} composio whoami`,
        ].join('\n')
      );
    }, TIMEOUTS.FIXTURE);

    afterAll(async () => {
      await signupServer.close();
      await guardrailServer.close();
      await reuseServer.close();
      await fallbackServer.close();
    });

    describe('composio login --agent (unattended onboarding)', () => {
      it('exits successfully', () => {
        expect(unattendedSignup.exitCode).toBe(0);
      });

      it('signs up via agents.composio.dev', () => {
        expect(signupServer.requests).toContain('POST /api/signup');
      });

      it('prints the agent login summary on stdout', () => {
        expect(unattendedSignup.stdout).toContain('"account_type":"agent"');
        expect(unattendedSignup.stdout).toContain('"logged_in":true');
        expect(unattendedSignup.stdout).toContain('"status":"READY"');
      });

      it('leaves the CLI authenticated as the agent (whoami)', () => {
        const whoami = lastJsonLine(unattendedSignup.stdout);
        expect(whoami.account_type).toBe('agent');
      });
    });

    describe('composio login (headless, no agent identity)', () => {
      it('exits successfully with instructions instead of hanging', () => {
        expect(headlessHumanLogin.exitCode).toBe(0);
        expect(headlessHumanLogin.stdout).toContain('Open this URL in your browser to log in:');
        expect(headlessHumanLogin.stdout).toContain('composio login --poll');
      });

      it('offers the unattended agent path', () => {
        expect(headlessHumanLogin.stdout).toContain('For unattended agents');
        expect(headlessHumanLogin.stdout).toContain('composio login --agent');
      });

      it('never auto-signs-up an account', () => {
        expect(guardrailServer.requests.filter(request => request.includes('/api/signup'))).toEqual(
          []
        );
      });
    });

    describe('composio login (headless, stored READY agent identity)', () => {
      it('completes login unattended by reusing the stored identity', () => {
        expect(storedIdentityLogin.exitCode).toBe(0);
        expect(storedIdentityLogin.stdout).toContain('"logged_in":true');
        expect(storedIdentityLogin.stdout).not.toContain('Open this URL in your browser');
      });

      it('refreshes the identity instead of signing up', () => {
        expect(reuseServer.requests).toContain('GET /api/whoami');
        expect(reuseServer.requests.filter(request => request.includes('/api/signup'))).toEqual([]);
      });

      it('leaves the CLI authenticated as the agent (whoami)', () => {
        const whoami = lastJsonLine(storedIdentityLogin.stdout);
        expect(whoami.account_type).toBe('agent');
      });
    });

    describe('credential storage without a Secret Service daemon', () => {
      it('exits successfully', () => {
        expect(plaintextFallback.exitCode).toBe(0);
      });

      it('keeps the API key in user_data.json and marks it as the fallback', () => {
        const userData = JSON.parse(section(plaintextFallback.stdout, 'USER-DATA')) as {
          api_key?: unknown;
          api_key_fallback?: unknown;
        };

        expect(typeof userData.api_key).toBe('string');
        expect(userData.api_key).toBe(fallbackServer.agentIdentity.composio.user_api_key);
        expect(userData.api_key_fallback).toBe(true);
      });

      it('restricts the fallback file to the current user', () => {
        expect(section(plaintextFallback.stdout, 'MODE')).toBe('600');
      });

      it('authenticates a second CLI process from the fallback', () => {
        const whoami = JSON.parse(
          section(plaintextFallback.stdout, 'WHOAMI').split('\n').at(-1) ?? '{}'
        ) as Record<string, unknown>;

        expect(whoami.account_type).toBe('agent');
      });
    });
  },
});
