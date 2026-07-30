import { describe, expect, layer } from '@effect/vitest';
import { vi, afterEach } from 'vitest';
import { Console, DateTime, Effect, Exit, Layer, Option } from 'effect';
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
import { ComposioSessionRepository } from 'src/services/composio-clients';
import { browserLogin } from 'src/commands/login.cmd';

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
    it.scoped(
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
    it.scoped(
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

  layer(TestLive())(it => {
    it.scoped('[When] logging in with --user-api-key --org [Then] stores the chosen org', () =>
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
    it.scoped(
      '[Given] selected-org enrichment fails [When] completing --poll [Then] links the selected org membership',
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const cacheDir = yield* setupCacheDir;
          const now = yield* DateTime.now;
          const expiresAt = DateTime.add(now, { minutes: 10 });
          const sessionId = 'poll-session-id';
          const sessionRepository = new ComposioSessionRepository({
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

  // ── browserLogin embedded mode ──────────────────────────────────────────────
  //
  // `composio onboard` drives login as one step of a longer flow and owns stdout for the whole
  // invocation, so embedded mode suppresses every `ui.output` write, the next-step hints, and the
  // outro — while leaving stderr decoration and the standalone contract untouched.

  describe('browserLogin embedded mode', () => {
    const SESSION_ID = 'te00st11-d0c4-4efa-8117-c638886063e0';
    const LOGIN_URL = `https://dashboard.composio.dev/?cliKey=${SESSION_ID}`;

    const spyOnOutput = (impl: TerminalUI) => {
      const outputs: string[] = [];
      const spied = TerminalUI.of({
        ...impl,
        output: (data, options) =>
          Effect.gen(function* () {
            outputs.push(data);
            yield* impl.output(data, options);
          }),
      });
      return { spied, outputs };
    };

    const linkedSessionRepository = Layer.succeed(
      ComposioSessionRepository,
      new ComposioSessionRepository({
        createSession: () =>
          Effect.gen(function* () {
            const now = yield* DateTime.now;
            return {
              id: SESSION_ID,
              code: '001122',
              expiresAt: DateTime.add(now, { minutes: 10 }),
              status: 'pending' as const,
            };
          }),
        getSession: () =>
          Effect.gen(function* () {
            const now = yield* DateTime.now;
            return {
              id: SESSION_ID,
              code: '001122',
              expiresAt: DateTime.add(now, { minutes: 10 }),
              status: 'linked' as const,
              api_key: 'uak_embedded',
              account: { name: 'test-name', id: 'test-id', email: 'test.name@gmail.com' },
            };
          }),
        getRealtimeCredentials: () =>
          Effect.succeed({
            project_id: 'proj_test',
            pusher_key: 'pusher_test_key',
            pusher_cluster: 'mt1',
          }),
        authRealtimeChannel: () => Effect.succeed({ auth: 'mock:auth', channel_data: undefined }),
      })
    );

    const mockSessionInfoFetch = () =>
      vi.spyOn(globalThis, 'fetch').mockImplementation(async requestInput => {
        const url = requestUrl(requestInput);
        if (url.includes('/api/v3/auth/session/info')) {
          return mockFetchResponse({
            project: {
              name: 'Default Project',
              id: 'project_id_default',
              org_id: 'org_embedded',
              nano_id: 'project_default',
              email: 'project@example.com',
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
              org: { id: 'org_embedded', name: 'Embedded Org', plan: 'enterprise' },
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
        return mockFetchResponse({});
      });

    describe('the pending branch', () => {
      const pendingUI = spyOnOutput(
        terminalUIWithTtyState({ stdin: true, stdout: false, stderr: true })
      );

      layer(TestLive({ terminalUI: pendingUI.spied }))(it => {
        it.scoped(
          '[Given] embedded and --no-wait [Then] returns pending and writes no stdout',
          () =>
            Effect.gen(function* () {
              pendingUI.outputs.length = 0;

              const outcome = yield* browserLogin({
                scope: 'user',
                noBrowser: false,
                noWait: true,
                embedded: true,
              });

              expect(outcome).toStrictEqual({
                status: 'pending',
                loginUrl: LOGIN_URL,
                pollCommand: 'composio login --poll',
              });
              expect(pendingUI.outputs).toEqual([]);
            })
        );
      });
    });

    describe('the standalone pending branch is unchanged', () => {
      const standaloneUI = spyOnOutput(
        terminalUIWithTtyState({ stdin: true, stdout: false, stderr: true })
      );

      layer(TestLive({ terminalUI: standaloneUI.spied }))(it => {
        it.scoped(
          '[Given] embedded is absent [Then] the login instructions still reach stdout',
          () =>
            Effect.gen(function* () {
              standaloneUI.outputs.length = 0;

              const outcome = yield* browserLogin({
                scope: 'user',
                noBrowser: false,
                noWait: true,
              });

              expect(outcome).toMatchObject({ status: 'pending', loginUrl: LOGIN_URL });
              expect(standaloneUI.outputs).toHaveLength(1);
              expect(standaloneUI.outputs[0]).toContain('Open this URL in your browser to log in:');
              expect(standaloneUI.outputs[0]).toContain('composio login --poll');
            })
        );
      });
    });

    // A human authorizing the URL the first call printed must still be able to finish. The pending
    // session file is the handoff `composio login --poll` reads, so overwriting it while an
    // embedding command re-runs would strand the authorization the human already completed.
    describe('a second embedded call while a login is outstanding', () => {
      const countingSessions = (ids: Array<string>) =>
        Layer.succeed(
          ComposioSessionRepository,
          new ComposioSessionRepository({
            createSession: () =>
              Effect.gen(function* () {
                const now = yield* DateTime.now;
                const id = `session-${ids.length + 1}`;
                ids.push(id);
                return {
                  id,
                  code: '001122',
                  expiresAt: DateTime.add(now, { minutes: 10 }),
                  status: 'pending' as const,
                };
              }),
            getSession: () => Effect.die('the poll must not be reached'),
            getRealtimeCredentials: () =>
              Effect.succeed({
                project_id: 'proj_test',
                pusher_key: 'pusher_test_key',
                pusher_cluster: 'mt1',
              }),
            authRealtimeChannel: () =>
              Effect.succeed({ auth: 'mock:auth', channel_data: undefined }),
          })
        );

      layer(TestLive({ terminalUI: headlessStdinUI }))(it => {
        it.scoped('[Given] embedded [Then] resumes the outstanding session', () =>
          Effect.gen(function* () {
            const minted: Array<string> = [];
            const sessions = countingSessions(minted);

            const first = yield* browserLogin({
              scope: 'user',
              noBrowser: true,
              noWait: true,
              embedded: true,
            }).pipe(Effect.provide(sessions));
            const second = yield* browserLogin({
              scope: 'user',
              noBrowser: true,
              noWait: true,
              embedded: true,
            }).pipe(Effect.provide(sessions));

            expect(minted).toStrictEqual(['session-1']);
            expect(second).toStrictEqual(first);
          })
        );
      });

      layer(TestLive({ terminalUI: headlessStdinUI }))(it => {
        it.scoped('[Given] embedded is absent [Then] a fresh session is minted every time', () =>
          Effect.gen(function* () {
            const minted: Array<string> = [];
            const sessions = countingSessions(minted);

            yield* browserLogin({ scope: 'user', noBrowser: true, noWait: true }).pipe(
              Effect.provide(sessions)
            );
            yield* browserLogin({ scope: 'user', noBrowser: true, noWait: true }).pipe(
              Effect.provide(sessions)
            );

            expect(minted).toStrictEqual(['session-1', 'session-2']);
          })
        );
      });
    });

    describe('a non-prompting invocation still short-circuits', () => {
      const headless = spyOnOutput(headlessStdinUI);

      layer(TestLive({ terminalUI: headless.spied }))(it => {
        it.scoped(
          '[Given] embedded and no TTY [Then] returns pending without waiting for the browser',
          () =>
            Effect.gen(function* () {
              headless.outputs.length = 0;

              const outcome = yield* browserLogin({
                scope: 'user',
                noBrowser: false,
                embedded: true,
              });

              expect(outcome).toMatchObject({ status: 'pending' });
              expect(headless.outputs).toEqual([]);
            })
        );
      });
    });

    describe('the linked branch', () => {
      const linkedUI = spyOnOutput(
        terminalUIWithTtyState({ stdin: true, stdout: false, stderr: true })
      );

      layer(TestLive({ terminalUI: linkedUI.spied }))(it => {
        it.scoped('[Given] embedded and a linked session [Then] returns the org id quietly', () =>
          Effect.gen(function* () {
            linkedUI.outputs.length = 0;
            mockSessionInfoFetch();

            const outcome = yield* browserLogin({
              scope: 'user',
              noBrowser: true,
              skipOrgProjectPicker: true,
              embedded: true,
            }).pipe(Effect.provide(linkedSessionRepository));

            expect(outcome).toStrictEqual({
              status: 'linked',
              email: 'test.name@gmail.com',
              orgId: 'org_embedded',
            });
            expect(linkedUI.outputs).toEqual([]);

            const stderrText = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
            expect(stderrText).not.toContain('Login complete');
            expect(stderrText).not.toContain('composio execute');
            expect(stderrText).not.toContain('composio orgs switch');
          })
        );
      });
    });

    describe('the standalone linked branch is unchanged', () => {
      const standaloneLinkedUI = spyOnOutput(
        terminalUIWithTtyState({ stdin: true, stdout: false, stderr: true })
      );

      layer(TestLive({ terminalUI: standaloneLinkedUI.spied }))(it => {
        it.scoped('[Given] embedded is absent [Then] the login URL still reaches stdout', () =>
          Effect.gen(function* () {
            standaloneLinkedUI.outputs.length = 0;
            mockSessionInfoFetch();

            const outcome = yield* browserLogin({
              scope: 'user',
              noBrowser: true,
              skipOrgProjectPicker: true,
            }).pipe(Effect.provide(linkedSessionRepository));

            expect(outcome).toMatchObject({ status: 'linked', orgId: 'org_embedded' });
            expect(standaloneLinkedUI.outputs).toContain(LOGIN_URL);
          })
        );
      });
    });
  });
});
