import { describe, expect, layer } from '@effect/vitest';
import { vi, afterEach } from 'vitest';
import { ConfigProvider, Console, DateTime, Effect, Exit, Option } from 'effect';
import path from 'node:path';
import * as FileSystem from 'effect/FileSystem';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import * as constants from 'src/constants';
import { setupCacheDir } from 'src/effects/setup-cache-dir';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import { writeStoredAgentIdentity } from 'src/services/agents';
import { ComposioUserContext } from 'src/services/user-context';
import { ComposioSessionRepository } from 'src/services/composio-clients';
import { extendConfigProvider } from 'src/services/config';
import { userApiKeyRejectionResponse } from 'test/__utils__/models/user-api-key-rejection';

vi.mock('open', () => ({
  default: vi.fn(async () => undefined),
}));

const analyticsMocks = vi.hoisted(() => ({
  linkCalls: [] as Array<{ apolloUserId: string; loggedInAtLinkTime: boolean }>,
}));

// Records each identity link and whether the credential had already been
// stored via ctx.login at call time — the link-after-persistence ordering.
vi.mock('src/analytics/dispatch', async importOriginal => {
  const actual = await importOriginal<typeof import('src/analytics/dispatch')>();
  const { Effect } = await import('effect');
  const { ComposioUserContext } = await import('src/services/user-context');
  return {
    ...actual,
    analyticsIdentityLinkingEnabled: Effect.succeed(true),
    linkApolloIdentityForAnalytics: ((apolloUserId: string) =>
      Effect.map(ComposioUserContext, ctx => {
        analyticsMocks.linkCalls.push({ apolloUserId, loggedInAtLinkTime: ctx.isLoggedIn() });
      })) as unknown as typeof actual.linkApolloIdentityForAnalytics,
  };
});

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
    analyticsMocks.linkCalls.length = 0;
  });

  describe('login --help', () => {
    layer(TestLive())(it => {
      it.effect('[Then] shows browser, session, direct-login flags and no legacy --api-key', () =>
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

  // v4 migration note: this business-level validation (only knowable after parsing) is a
  // plain typed domain error (`LoginOptionError`), not a `CliError.InvalidValue` — see the
  // migration note in `login.cmd.ts` above `invalidOptionValue`.
  layer(TestLive())(it => {
    it.effect('[Given] conflicting login options [Then] fails with a CLI validation error', () =>
      Effect.gen(function* () {
        const error = yield* cli([
          'login',
          '--key',
          'cli_session_key',
          '--user-api-key',
          'uak_direct_key',
        ]).pipe(Effect.flip);

        expect(error).toMatchObject({
          message: 'Use either `--key` or `--user-api-key`, not both.',
        });
      })
    );
  });

  layer(TestLive({ terminalUI: headlessStdinUI }))(it => {
    it.effect('[When] stdin is non-interactive [Then] login prints agent instructions', () =>
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
        expect(
          (yield* fs.stat(path.join(cacheDir, 'pending-login-session.json'))).mode & 0o777
        ).toBe(0o600);

        expect(output).not.toContain('-- composio login --');
        expect(output).not.toContain('Please login using the following URL');
        expect(output).not.toContain('Login URL');
        expect(output).not.toContain('Login instructions');
        expect(output).not.toContain('Installed composio-cli skill');
      })
    );
  });

  layer(TestLive({ terminalUI: headlessStdinUI }))(it => {
    it.effect(
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
    it.effect(
      '[Given] a stored READY agent identity the API rejects [When] login runs headlessly [Then] does not reuse the revoked identity',
      () =>
        Effect.gen(function* () {
          yield* writeStoredAgentIdentity(storedAgentIdentity);
          vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput =>
            requestUrl(requestInput).includes('/api/whoami')
              ? mockFetchResponse({ message: 'Invalid agent key' }, 401)
              : mockFetchResponse({})
          );

          yield* cli(['login']);

          const ctx = yield* ComposioUserContext;
          expect(Option.getOrUndefined(ctx.data.apiKey)).toBeUndefined();

          const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
          expect(output).not.toContain('"logged_in":true');
          expect(output).toContain('Open this URL in your browser to log in:');
        })
    );
  });

  layer(TestLive({ terminalUI: headlessStdinUI }))(it => {
    it.effect(
      '[Given] a stored READY agent identity and an unreachable agents API [When] login runs headlessly [Then] still reuses the on-disk identity',
      () =>
        Effect.gen(function* () {
          yield* writeStoredAgentIdentity(storedAgentIdentity);
          vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput => {
            if (requestUrl(requestInput).includes('/api/whoami')) {
              throw new Error('network unreachable');
            }
            return mockFetchResponse({});
          });

          yield* cli(['login']);

          const ctx = yield* ComposioUserContext;
          expect(Option.getOrUndefined(ctx.data.apiKey)).toBe('uak_agent');
          expect(Option.getOrUndefined(ctx.data.orgId)).toBe('org_agent');
        })
    );
  });

  layer(TestLive({ terminalUI: headlessStdinUI }))(it => {
    it.effect(
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
    it.effect(
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
      it.effect(
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
    it.effect(
      '[Given] an unreadable pending login cache [Then] poll reports the read failure, not a decode failure',
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const cacheDir = yield* setupCacheDir;
          // A directory at the cache path passes the exists check but fails the read.
          yield* fs.makeDirectory(path.join(cacheDir, 'pending-login-session.json'), {
            recursive: true,
          });

          const error = yield* cli(['login', '--poll']).pipe(Effect.flip);

          expect(error).toMatchObject({
            _tag: 'commands/PendingLoginError',
            reason: 'io',
            message: 'Failed to read pending login cache',
          });
        })
    );
  });

  const stopBeforeSessionPollUI = TerminalUI.of({
    ...headlessStdinUI,
    useMakeSpinner: () => Effect.die(new Error('test: stop before session poll')),
  });

  layer(TestLive({ terminalUI: stopBeforeSessionPollUI }))(it => {
    it.effect('repairs permissions on an existing pending login session before reading it', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* setupCacheDir;
        const pendingPath = path.join(cacheDir, 'pending-login-session.json');
        const cachedAt = new Date().toISOString();
        const pendingLogin = `${JSON.stringify(
          {
            key: 'legacy-session-id',
            loginUrl: 'https://dashboard.composio.dev/?cliKey=legacy-session-id',
            expiresAt: cachedAt,
            cachedAt,
          },
          null,
          2
        )}\n`;
        yield* fs.writeFileString(pendingPath, pendingLogin);
        yield* fs.chmod(pendingPath, 0o644);
        expect((yield* fs.stat(pendingPath)).mode & 0o777).toBe(0o644);

        const exit = yield* Effect.exit(cli(['login', '--poll']));

        expect(Exit.isFailure(exit)).toBe(true);
        expect(yield* fs.readFileString(pendingPath, 'utf8')).toBe(pendingLogin);
        expect((yield* fs.stat(pendingPath)).mode & 0o777).toBe(0o600);
      })
    );
  });

  layer(TestLive())(it => {
    it.effect('[When] logging in with --user-api-key --org [Then] stores the chosen org', () =>
      Effect.gen(function* () {
        vi.spyOn(globalThis, 'fetch').mockImplementation(
          async (requestInput: RequestInfo | URL, init?: RequestInit) => {
            const url = requestUrl(requestInput);

            if (url.includes('/api/v3/auth/session/info')) {
              const selectedOrgId = new Headers(init?.headers).get('x-org-id');
              return mockFetchResponse({
                project: {
                  name: 'Default Project',
                  id: 'project_id_default',
                  org_id: selectedOrgId ?? 'org_default',
                  nano_id: 'project_default',
                  email: 'project@example.com',
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-01T00:00:00.000Z',
                  org: {
                    id: selectedOrgId ?? 'org_default',
                    name: selectedOrgId ? 'Selected Org' : 'Example Org',
                    plan: 'enterprise',
                  },
                },
                org_member: {
                  id: selectedOrgId ? 'member_selected' : 'member_default',
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
        expect((yield* fs.stat(userConfigPath)).mode & 0o777).toBe(0o600);

        // ComposioUserContext also exposes the resolved key in-memory
        // for subsequent API calls in this process.
        const ctx = yield* ComposioUserContext;
        expect(Option.getOrUndefined(ctx.data.apiKey)).toBe('uak_direct_key');

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Logged in as cli@example.com in "Selected Org"');

        // The analytics identity is linked exactly once, and only after the
        // credential was stored via ctx.login, using the selected org's
        // membership rather than the API key's home-org membership.
        expect(analyticsMocks.linkCalls).toEqual([
          { apolloUserId: 'member_selected', loggedInAtLinkTime: true },
        ]);
      })
    );
  });

  layer(TestLive())(it => {
    it.effect(
      '[Given] selected-org enrichment fails [When] completing --poll [Then] links the selected org membership',
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const cacheDir = yield* setupCacheDir;
          const now = yield* DateTime.now;
          const expiresAt = DateTime.add(now, { minutes: 10 });
          const sessionId = 'poll-session-id';
          const sessionRepository = ComposioSessionRepository.of({
            createSession: () =>
              Effect.succeed({
                id: sessionId,
                code: '001122',
                expiresAt,
                status: 'pending',
              }),
            getSession: () =>
              Effect.succeed({
                id: sessionId,
                code: '001122',
                expiresAt,
                status: 'linked',
                api_key: 'uak_poll_key',
                account: {
                  id: 'account_id',
                  name: 'Poll User',
                  email: 'poll@example.com',
                },
              }),
            getRealtimeCredentials: () =>
              Effect.succeed({
                project_id: 'proj_test',
                pusher_key: 'pusher_test_key',
                pusher_cluster: 'mt1',
              }),
            authRealtimeChannel: () =>
              Effect.succeed({
                auth: 'mock:auth',
                channel_data: undefined,
              }),
          });

          yield* fs.writeFileString(
            path.join(cacheDir, 'pending-login-session.json'),
            `${JSON.stringify(
              {
                key: sessionId,
                loginUrl: `https://dashboard.composio.dev/?cliKey=${sessionId}`,
                expiresAt: DateTime.formatIso(expiresAt),
                cachedAt: new Date().toISOString(),
              },
              null,
              2
            )}\n`
          );

          vi.spyOn(globalThis, 'fetch').mockImplementation(
            async (requestInput: RequestInfo | URL, init?: RequestInit) => {
              const url = requestUrl(requestInput);
              const headers = new Headers(init?.headers);

              if (url.includes('/api/v3/auth/session/info')) {
                const selectedOrgId = headers.get('x-org-id');
                if (headers.has('x-project-id')) {
                  return mockFetchResponse({ message: 'Selected-org enrichment failed' }, 500);
                }
                return mockFetchResponse({
                  project: {
                    name: 'Default Project',
                    id: 'project_id_default',
                    org_id: selectedOrgId ?? 'org_home',
                    nano_id: 'project_default',
                    email: 'project@example.com',
                    created_at: '2026-01-01T00:00:00.000Z',
                    updated_at: '2026-01-01T00:00:00.000Z',
                    org: {
                      id: selectedOrgId ?? 'org_home',
                      name: selectedOrgId ? 'Selected Org' : 'Home Org',
                      plan: 'enterprise',
                    },
                  },
                  org_member: {
                    id: selectedOrgId ? 'member_selected' : 'member_home',
                    user_id: 'user_123',
                    email: 'poll@example.com',
                    name: 'Poll User',
                    role: 'admin',
                  },
                  api_key: null,
                });
              }

              if (url.includes('/api/v3/org/list?limit=50')) {
                return mockFetchResponse({
                  organizations: [
                    { id: 'org_selected', name: 'Selected Org' },
                    { id: 'org_home', name: 'Home Org' },
                  ],
                });
              }

              return mockFetchResponse({});
            }
          );

          yield* cli(['login', '--poll', '--no-skill-install']).pipe(
            Effect.provideService(ComposioSessionRepository, sessionRepository)
          );

          const ctx = yield* ComposioUserContext;
          expect(Option.getOrUndefined(ctx.data.orgId)).toBe('org_selected');
          expect(analyticsMocks.linkCalls).toEqual([
            { apolloUserId: 'member_selected', loggedInAtLinkTime: true },
          ]);
        })
    );
  });

  describe('login target environment', () => {
    const stagingLoginWithoutOrg = {
      api_key: 'uak_old_staging',
      base_url: constants.STAGING_BASE_URL,
      web_url: constants.STAGING_WEB_URL,
    };

    const sessionInfoBody = {
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
        id: 'member_default',
        user_id: 'user_123',
        email: 'cli@example.com',
        name: 'CLI User',
        role: 'admin',
      },
      api_key: null,
    };

    const readStoredUserConfig = Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cacheDir = yield* setupCacheDir;
      const raw = yield* fs.readFileString(
        path.join(cacheDir, constants.USER_CONFIG_FILE_NAME),
        'utf8'
      );
      return JSON.parse(raw) as Record<string, unknown>;
    });

    const spyOnSessionInfo = () => {
      const requestedUrls: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput => {
        const url = requestUrl(requestInput);
        requestedUrls.push(url);
        return url.includes('/api/v3/auth/session/info')
          ? mockFetchResponse(sessionInfoBody)
          : mockFetchResponse({});
      });
      return requestedUrls;
    };

    layer(TestLive({ userData: stagingLoginWithoutOrg }))(it => {
      it.effect(
        '[Given] a stored staging login and no env vars [When] logging in with --user-api-key [Then] validates against and records production',
        () =>
          Effect.gen(function* () {
            const requestedUrls = spyOnSessionInfo();

            yield* cli(['login', '--user-api-key', 'uak_new', '--no-skill-install']);

            const sessionInfoUrl = requestedUrls.find(url =>
              url.includes('/api/v3/auth/session/info')
            );
            expect(sessionInfoUrl).toBeDefined();
            expect(new URL(sessionInfoUrl!).origin).toBe(constants.DEFAULT_BASE_URL);

            const userConfig = yield* readStoredUserConfig;
            expect(userConfig.api_key).toBe('uak_new');
            expect(userConfig.base_url).toBe(constants.DEFAULT_BASE_URL);
            expect(userConfig.web_url).toBe(constants.DEFAULT_WEB_URL);

            const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
            expect(output).not.toContain('Logging in to');
          })
      );
    });

    const stagingEnv = ConfigProvider.fromEnvRecord({ COMPOSIO_ENVIRONMENT: 'staging' }).pipe(
      extendConfigProvider
    );

    layer(TestLive({ baseConfigProvider: stagingEnv }))(it => {
      it.effect(
        '[Given] COMPOSIO_ENVIRONMENT=staging [When] logging in with --user-api-key [Then] names the staging host first and records staging',
        () =>
          Effect.gen(function* () {
            const requestedUrls = spyOnSessionInfo();

            yield* cli(['login', '--user-api-key', 'uak_new', '--no-skill-install']);

            expect(
              requestedUrls.every(url => new URL(url).origin === constants.STAGING_BASE_URL)
            ).toBe(true);
            const userConfig = yield* readStoredUserConfig;
            expect(userConfig.base_url).toBe(constants.STAGING_BASE_URL);
            expect(userConfig.web_url).toBe(constants.STAGING_WEB_URL);

            const lines = yield* MockConsole.getLines({ stripAnsi: true });
            const announcement = lines.findIndex(line =>
              line.includes('Logging in to staging-backend.composio.dev')
            );
            const success = lines.findIndex(line => line.includes('Logged in as'));
            expect(announcement).toBeGreaterThanOrEqual(0);
            expect(announcement).toBeLessThan(success);
          })
      );
    });

    const recordingSessionRepository = (calls: Array<{ readonly baseURL?: string }>) =>
      Effect.gen(function* () {
        const expiresAt = DateTime.add(yield* DateTime.now, { minutes: 10 });
        return ComposioSessionRepository.of({
          createSession: params => {
            calls.push({ baseURL: params?.baseURL });
            return Effect.succeed({
              id: 'target-session-id',
              code: '001122',
              expiresAt,
              status: 'pending',
            });
          },
          getSession: () => Effect.die(new Error('test: not polled')),
          getRealtimeCredentials: () => Effect.die(new Error('test: unused')),
          authRealtimeChannel: () => Effect.die(new Error('test: unused')),
        });
      });

    layer(TestLive({ terminalUI: headlessStdinUI, userData: stagingLoginWithoutOrg }))(it => {
      it.effect(
        '[Given] a stored staging web_url [When] browser login starts [Then] it uses the production dashboard and backend',
        () =>
          Effect.gen(function* () {
            const calls: Array<{ readonly baseURL?: string }> = [];
            const sessionRepository = yield* recordingSessionRepository(calls);

            yield* cli(['login']).pipe(
              Effect.provideService(ComposioSessionRepository, sessionRepository)
            );

            expect(calls).toEqual([{ baseURL: constants.DEFAULT_BASE_URL }]);
            const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
            expect(output).toContain(`${constants.DEFAULT_WEB_URL}?cliKey=target-session-id`);
            expect(output).not.toContain('staging-dashboard');
          })
      );
    });

    layer(TestLive({ terminalUI: headlessStdinUI, baseConfigProvider: stagingEnv }))(it => {
      it.effect(
        '[Given] COMPOSIO_ENVIRONMENT=staging [When] browser login starts [Then] names the staging host before the URL',
        () =>
          Effect.gen(function* () {
            const calls: Array<{ readonly baseURL?: string }> = [];
            const sessionRepository = yield* recordingSessionRepository(calls);

            yield* cli(['login']).pipe(
              Effect.provideService(ComposioSessionRepository, sessionRepository)
            );

            expect(calls).toEqual([{ baseURL: constants.STAGING_BASE_URL }]);
            const lines = yield* MockConsole.getLines({ stripAnsi: true });
            const announcement = lines.findIndex(line =>
              line.includes('Logging in to staging-backend.composio.dev')
            );
            const instructions = lines.findIndex(line =>
              line.includes(`${constants.STAGING_WEB_URL}?cliKey=target-session-id`)
            );
            expect(announcement).toBeGreaterThanOrEqual(0);
            expect(announcement).toBeLessThan(instructions);
          })
      );
    });

    const stagingLogin = { ...stagingLoginWithoutOrg, org_id: 'org_staging' };

    layer(TestLive({ terminalUI: headlessStdinUI, userData: stagingLogin }))(it => {
      it.effect(
        'Covers AE7. [Given] a stored key the backend accepts [Then] reports already logged in',
        () =>
          Effect.gen(function* () {
            const requestedUrls = spyOnSessionInfo();

            yield* cli(['login']);

            expect(requestedUrls).toHaveLength(1);
            expect(new URL(requestedUrls[0]!).origin).toBe(constants.STAGING_BASE_URL);
            const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
            expect(output).toContain("You're already logged in!");
            expect(output).not.toContain('Open this URL in your browser to log in:');
          })
      );
    });

    layer(TestLive({ terminalUI: headlessStdinUI, userData: stagingLogin }))(it => {
      it.effect(
        '[Given] the stored key cannot be checked [Then] reports already logged in as before',
        () =>
          Effect.gen(function* () {
            vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unreachable'));

            yield* cli(['login']);

            const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
            expect(output).toContain("You're already logged in!");
          })
      );
    });

    const rejectStoredKey = () =>
      vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(userApiKeyRejectionResponse()));

    layer(TestLive({ terminalUI: headlessStdinUI, userData: stagingLogin }))(it => {
      it.effect(
        'Covers AE7. [Given] the stored staging key is rejected [Then] login proceeds against production',
        () =>
          Effect.gen(function* () {
            rejectStoredKey();
            const calls: Array<{ readonly baseURL?: string }> = [];
            const sessionRepository = yield* recordingSessionRepository(calls);

            yield* cli(['login']).pipe(
              Effect.provideService(ComposioSessionRepository, sessionRepository)
            );

            expect(calls).toEqual([{ baseURL: constants.DEFAULT_BASE_URL }]);
            const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
            expect(output).not.toContain("You're already logged in!");
            expect(output).toContain(`${constants.DEFAULT_WEB_URL}?cliKey=target-session-id`);
          })
      );
    });

    layer(
      TestLive({
        terminalUI: headlessStdinUI,
        userData: stagingLogin,
        baseConfigProvider: stagingEnv,
      })
    )(it => {
      it.effect(
        'Covers AE7. [Given] a rejected key and COMPOSIO_ENVIRONMENT=staging [Then] names the staging host first',
        () =>
          Effect.gen(function* () {
            rejectStoredKey();
            const calls: Array<{ readonly baseURL?: string }> = [];
            const sessionRepository = yield* recordingSessionRepository(calls);

            yield* cli(['login']).pipe(
              Effect.provideService(ComposioSessionRepository, sessionRepository)
            );

            expect(calls).toEqual([{ baseURL: constants.STAGING_BASE_URL }]);
            const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
            expect(output).toContain('Logging in to staging-backend.composio.dev');
          })
      );
    });

    layer(TestLive({ terminalUI: headlessStdinUI }))(it => {
      it.effect('[Given] no env vars [When] an agent logs in [Then] production is recorded', () =>
        Effect.gen(function* () {
          yield* writeStoredAgentIdentity(storedAgentIdentity);
          vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput =>
            requestUrl(requestInput).includes('/api/whoami')
              ? mockFetchResponse(storedAgentIdentity)
              : mockFetchResponse({})
          );

          yield* cli(['login']);

          const userConfig = yield* readStoredUserConfig;
          expect(userConfig.api_key).toBe('uak_agent');
          expect(userConfig.base_url).toBe(constants.DEFAULT_BASE_URL);
        })
      );
    });
  });
});
