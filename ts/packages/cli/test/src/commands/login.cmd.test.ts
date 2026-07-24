import { describe, expect, layer } from '@effect/vitest';
import { vi, afterEach } from 'vitest';
import { Console, Effect, Exit, Option } from 'effect';
import { HelpDoc, ValidationError } from '@effect/cli';
import path from 'node:path';
import { FileSystem } from '@effect/platform';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import { writeStoredAgentIdentity } from 'src/services/agents';
import { ComposioUserContext } from 'src/services/user-context';

vi.mock('open', () => ({
  default: vi.fn(async () => undefined),
}));

const mockFetchResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const requestUrl = (requestInput: RequestInfo | URL): string =>
  typeof requestInput === 'string'
    ? requestInput
    : requestInput instanceof URL
      ? requestInput.toString()
      : requestInput.url;

const storedAgentIdentity = {
  status: 'READY',
  slug: 'test-agent',
  email: 'test-agent@agent.composio.ai',
  composio_agent_key: 'cak_test_agent',
  composio: {
    member_id: 'mem_agent',
    org_id: 'org_agent',
    project_id: 'proj_agent',
    user_api_key: 'uak_agent',
  },
};

const terminalUIWithTtyState = (state: {
  readonly stdin: boolean;
  readonly stdout: boolean;
  readonly stderr: boolean;
}) =>
  TerminalUI.of({
    ...terminalUITestImpl,
    capabilities: Effect.succeed(
      getTerminalCapabilities({
        stdin: { isTTY: state.stdin },
        stdout: { isTTY: state.stdout },
        stderr: { isTTY: state.stderr },
      })
    ),
  });

const headlessStdinUI = terminalUIWithTtyState({
  stdin: false,
  stdout: false,
  stderr: false,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CLI: composio login', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login --help', () => {
    layer(TestLive())(it => {
      it.scoped('[Then] shows browser, session, direct-login flags and no legacy --api-key', () =>
        Effect.gen(function* () {
          yield* cli(['login', '--help']);
          const lines = yield* MockConsole.getLines();
          const output = lines.join('\n');
          expect(output).toContain('--no-browser');
          expect(output).toContain('--no-wait');
          expect(output).toContain('--poll');
          expect(output).toContain('--key');
          expect(output).toContain('--user-api-key');
          expect(output).toContain('--org');
          expect(output).toContain('--yes');
          expect(output).toContain('-y');
          expect(output).not.toMatch(/(^|\s)--api-key(?:\s|$)/);
        })
      );
    });
  });

  layer(TestLive())(it => {
    it.scoped('[Given] conflicting login options [Then] fails with a CLI validation error', () =>
      Effect.gen(function* () {
        const error = yield* cli([
          'login',
          '--key',
          'cli_session_key',
          '--user-api-key',
          'uak_direct_key',
        ]).pipe(Effect.flip);

        expect(ValidationError.isValidationError(error)).toBe(true);
        if (!ValidationError.isValidationError(error)) return;
        expect(ValidationError.isInvalidValue(error)).toBe(true);
        expect(HelpDoc.toAnsiText(error.error)).toContain(
          'Use either `--key` or `--user-api-key`, not both.'
        );
      })
    );
  });

  layer(TestLive({ terminalUI: headlessStdinUI }))(it => {
    it.scoped('[When] stdin is non-interactive [Then] login prints agent instructions', () =>
      Effect.gen(function* () {
        yield* cli(['login']);

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Open this URL in your browser to log in:');
        expect(output).toContain(
          'https://dashboard.composio.dev/?cliKey=te00st11-d0c4-4efa-8117-c638886063e0'
        );
        expect(output).toContain('Then run this command to complete login:');
        expect(output).toContain('composio login --poll');
        expect(output).toContain('hint: For agents:');
        expect(output).toContain('cached login key');
        expect(output).toContain('polls for up to 10 minutes');
        expect(output).not.toContain('Expires at:');
        expect(output).toContain('Do not ask the user whether to poll');
        expect(output).toContain('hint: For unattended agents:');
        expect(output).toContain('composio login --agent');

        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const pendingLoginRaw = yield* fs.readFileString(
          path.join(cacheDir, 'pending-login-session.json'),
          'utf8'
        );
        const pendingLogin = JSON.parse(pendingLoginRaw) as Record<string, unknown>;
        expect(pendingLogin.key).toBe('te00st11-d0c4-4efa-8117-c638886063e0');

        expect(output).not.toContain('-- composio login --');
        expect(output).not.toContain('Please login using the following URL');
        expect(output).not.toContain('Login URL');
        expect(output).not.toContain('Login instructions');
        expect(output).not.toContain('Installed composio-cli skill');
      })
    );
  });

  layer(TestLive({ terminalUI: headlessStdinUI }))(it => {
    it.scoped(
      '[Given] a stored READY agent identity [When] login runs headlessly [Then] completes agent login unattended',
      () =>
        Effect.gen(function* () {
          yield* writeStoredAgentIdentity(storedAgentIdentity);
          vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput =>
            requestUrl(requestInput).includes('/api/whoami')
              ? mockFetchResponse(storedAgentIdentity)
              : mockFetchResponse({})
          );

          yield* cli(['login']);

          const ctx = yield* ComposioUserContext;
          expect(Option.getOrUndefined(ctx.data.apiKey)).toBe('uak_agent');
          expect(Option.getOrUndefined(ctx.data.orgId)).toBe('org_agent');

          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('"account_type":"agent"');
          expect(output).toContain('"logged_in":true');
          expect(output).not.toContain('Open this URL in your browser to log in:');

          const fs = yield* FileSystem.FileSystem;
          const cacheDir = yield* setupCacheDir;
          const pendingExists = yield* fs.exists(path.join(cacheDir, 'pending-login-session.json'));
          expect(pendingExists).toBe(false);
        })
    );
  });

  layer(TestLive({ terminalUI: headlessStdinUI }))(it => {
    it.scoped(
      '[Given] a stored PENDING agent identity [When] login runs headlessly [Then] prints instructions without logging in',
      () =>
        Effect.gen(function* () {
          yield* writeStoredAgentIdentity({ ...storedAgentIdentity, status: 'PENDING' });
          vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput =>
            requestUrl(requestInput).includes('/api/whoami')
              ? mockFetchResponse({ ...storedAgentIdentity, status: 'PENDING' })
              : mockFetchResponse({})
          );

          yield* cli(['login']);

          const ctx = yield* ComposioUserContext;
          expect(Option.getOrUndefined(ctx.data.apiKey)).toBeUndefined();

          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('Open this URL in your browser to log in:');
          expect(output).toContain('composio login --agent');
        })
    );
  });

  layer(TestLive({ terminalUI: headlessStdinUI }))(it => {
    it.scoped(
      '[Given] no stored agent identity [When] login runs headlessly [Then] never auto-signs-up an agent',
      () =>
        Effect.gen(function* () {
          const requestedUrls: string[] = [];
          vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput => {
            requestedUrls.push(requestUrl(requestInput));
            return mockFetchResponse({});
          });

          yield* cli(['login']);

          expect(requestedUrls.filter(url => url.includes('/api/signup'))).toEqual([]);

          const ctx = yield* ComposioUserContext;
          expect(Option.getOrUndefined(ctx.data.apiKey)).toBeUndefined();

          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).toContain('Open this URL in your browser to log in:');
        })
    );
  });

  describe('login with stdout piped', () => {
    const pipedStdoutUI = TerminalUI.of({
      ...terminalUIWithTtyState({ stdin: true, stdout: false, stderr: true }),
      useMakeSpinner: (message, _use) =>
        Console.log(`[spinner] ${message}`).pipe(
          Effect.andThen(Effect.die(new Error('test: interactive poll loop entered')))
        ),
    });

    layer(TestLive({ terminalUI: pipedStdoutUI }))(it => {
      it.scoped(
        '[Given] a stored agent [When] stdout is piped but stdin and stderr are TTYs [Then] login stays interactive',
        () =>
          Effect.gen(function* () {
            yield* writeStoredAgentIdentity(storedAgentIdentity);
            const requestedUrls: string[] = [];
            vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput => {
              requestedUrls.push(requestUrl(requestInput));
              return mockFetchResponse(storedAgentIdentity);
            });

            const exit = yield* Effect.exit(cli(['login']));

            const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
            expect(output).toContain('[spinner] Waiting for login...');
            expect(output).toContain('Redirecting you to the login page');
            expect(output).not.toContain('Open this URL in your browser to log in:');
            expect(output).not.toContain('hint: For agents:');
            expect(output).not.toContain('Then run this command to complete login:');
            expect(requestedUrls).not.toContainEqual(expect.stringContaining('/api/whoami'));
            expect(Exit.isFailure(exit)).toBe(true);
          })
      );
    });
  });

  layer(TestLive())(it => {
    it.scoped('[When] logging in with --user-api-key --org [Then] stores the chosen org', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockImplementation(
          async (requestInput: RequestInfo | URL, init?: RequestInit) => {
            const url = requestUrl(requestInput);

            if (url.includes('/api/v3/auth/session/info')) {
              return mockFetchResponse({
                project: {
                  name: 'Default Project',
                  id: 'project_id_default',
                  org_id: 'org_default',
                  nano_id: 'project_default',
                  email: 'project@example.com',
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-01T00:00:00.000Z',
                  org: { id: 'org_default', name: 'Example Org', plan: 'enterprise' },
                },
                org_member: {
                  id: 'member_123',
                  user_id: 'user_123',
                  email: 'cli@example.com',
                  name: 'CLI User',
                  role: 'admin',
                },
                api_key: null,
              });
            }

            if (url.includes('/api/v3/org/list?limit=50')) {
              expect(new Headers(init?.headers).get('x-user-api-key')).toBe('uak_direct_key');
              return mockFetchResponse({
                organizations: [
                  { id: 'org_default', name: 'Example Org' },
                  { id: 'org_selected', name: 'Selected Org' },
                ],
              });
            }

            return mockFetchResponse({});
          }
        );

        yield* cli([
          'login',
          '--user-api-key',
          'uak_direct_key',
          '--org',
          'org_selected',
          '--no-skill-install',
        ]);

        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const userConfigPath = path.join(cacheDir, constants.USER_CONFIG_FILE_NAME);
        const rawUserConfig = yield* fs.readFileString(userConfigPath, 'utf8');
        const userConfig = JSON.parse(rawUserConfig) as Record<string, unknown>;
        // Default `security: "auto"` keeps the API key in plaintext
        // `user_data.json` for backwards compatibility — same as
        // every prior CLI release. Users opt into keyring storage
        // by setting `security: "keychain-subprocess"` (or
        // `"keychain"` for the experimental FFI path) in
        // `~/.composio/config.json`.
        expect(userConfig.api_key).toBe('uak_direct_key');
        expect(userConfig.org_id).toBe('org_selected');

        // ComposioUserContext also exposes the resolved key in-memory
        // for subsequent API calls in this process.
        const ctx = yield* ComposioUserContext;
        expect(Option.getOrUndefined(ctx.data.apiKey)).toBe('uak_direct_key');

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Logged in as cli@example.com in "Selected Org"');
      })
    );
  });
});
