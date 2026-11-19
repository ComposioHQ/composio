import { BadRequestError, type RequestOptions } from '@composio/client/effect';
import { describe, expect, it, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Option } from 'effect';
import { afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import type {
  SessionCreateParams,
  SessionProxyExecuteParams,
} from '@composio/client/resources/tool-router';
import { ReportedProxyCommandError } from 'src/commands/proxy/proxy.errors';
import {
  normalizeProxyMethod,
  parseProxyBody,
  parseProxyHeader,
} from 'src/commands/proxy/proxy.handler';
import * as consumerShortTermCache from 'src/services/consumer-short-term-cache';
import * as toolPermissions from 'src/services/tool-permissions';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { redirectedTerminalUI } from 'test/__utils__/services/redirected-terminal-ui';

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

const noActiveConnection = {
  code: 4302,
  slug: 'ToolRouterV2_NoActiveConnection',
  message: 'No active connection',
  status: 400,
};

describe('CLI: composio proxy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses curl-style header values', () => {
    expect(parseProxyHeader('content-type: application/json')).toEqual({
      name: 'content-type',
      value: 'application/json',
    });
  });

  it('normalizes HTTP methods', () => {
    expect(normalizeProxyMethod('post')).toBe('POST');
  });

  it('parses JSON-like request bodies when possible', () => {
    expect(parseProxyBody('{ foo: "bar" }')).toEqual({ foo: 'bar' });
    expect(parseProxyBody('plain text')).toBe('plain text');
  });

  describe('[Given] stdin is a pipe', () => {
    /** Runs `composio proxy` over `stdin` and returns the body it sent to proxy_execute. */
    const proxyBodyOver = (stdin: PassThrough, args: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        let sentParams: SessionProxyExecuteParams | undefined;
        const live = TestLive({
          baseConfigProvider: testConfigProvider,
          fixture: 'global-test-user-id',
          stdin: { isTTY: false, data: '', stream: stdin },
          toolRouter: {
            proxyExecute: (_sessionId: string, params: SessionProxyExecuteParams) =>
              Effect.sync(() => {
                sentParams = params;
                return {
                  result_type: 'completed' as const,
                  status: 200,
                  data: { ok: true },
                  headers: {},
                };
              }),
          },
        });
        const output = yield* Effect.gen(function* () {
          yield* cli([
            'proxy',
            'https://gmail.googleapis.com/gmail/v1/users/me/profile',
            '--toolkit',
            'gmail',
            ...args,
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          return lines.join('\n');
        }).pipe(Effect.provide(live));
        expect(sentParams).toBeDefined();
        return { body: sentParams?.body, output };
      });

    it.live(
      '[When] it is held open and no -d is passed [Then] the request is sent without reading it',
      () =>
        Effect.gen(function* () {
          const heldOpen = new PassThrough();
          heldOpen.write('{"never":"read"}');

          const { body, output } = yield* proxyBodyOver(heldOpen, []);

          expect(body).toBeUndefined();
          expect(heldOpen.readableLength).toBeGreaterThan(0);
          expect(output).not.toContain('Sending the request without a body');
        })
    );

    // A bodiless GET is the read agents run with a held-open pipe, so only the other methods warn.
    it.live.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      '[When] a %s is sent without -d [Then] it warns that piped input is not the body, without reading it',
      method =>
        Effect.gen(function* () {
          const piped = new PassThrough();
          piped.write('{"meant":"as body"}');

          const { body, output } = yield* proxyBodyOver(piped, ['-X', method]);

          expect(body).toBeUndefined();
          expect(piped.readableLength).toBeGreaterThan(0);
          expect(output).toContain(
            'Sending the request without a body: composio proxy reads stdin only with -d -. Pass -d - to send piped input as the body.'
          );
        })
    );

    it.live('[When] -d - is passed [Then] the body is read from stdin', () =>
      Effect.gen(function* () {
        const piped = new PassThrough();
        setTimeout(() => piped.end('{"message":{"raw":"abc"}}'), 1500);

        const { body, output } = yield* proxyBodyOver(piped, ['-X', 'POST', '-d', '-']);

        expect(body).toEqual({ message: { raw: 'abc' } });
        expect(output).not.toContain('Sending the request without a body');
      })
    );

    it.live('[When] -d @- is passed [Then] the body is read from stdin', () =>
      Effect.gen(function* () {
        const piped = new PassThrough();
        piped.end('plain text');

        const { body } = yield* proxyBodyOver(piped, ['-X', 'POST', '-d', '@-']);

        expect(body).toBe('plain text');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] curl-like proxy flags [Then] it creates a scoped session and forwards proxy_execute',
    it => {
      it.effect('forwards proxy execute params and prints the response', () =>
        Effect.gen(function* () {
          let createParams: SessionCreateParams | undefined;
          let proxyOptions: RequestOptions | undefined;
          let proxyParams:
            | {
                sessionId: string;
                params: SessionProxyExecuteParams;
              }
            | undefined;

          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            fixture: 'global-test-user-id',
            cliUserConfig: { experimentalFeatures: { multi_account: false } },
            connectedAccountsData: {
              items: [
                {
                  id: 'con_gmail_work',
                  alias: 'work',
                  word_id: 'gmail-work',
                  status: 'ACTIVE',
                  status_reason: null,
                  is_disabled: false,
                  user_id: 'consumer-user-org_test',
                  toolkit: { slug: 'gmail' },
                  auth_config: {
                    id: 'ac_gmail_oauth',
                    auth_scheme: 'OAUTH2',
                    is_composio_managed: true,
                    is_disabled: false,
                  },
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-01T00:00:00.000Z',
                  test_request_endpoint: '',
                },
                {
                  id: 'con_gmail_personal',
                  alias: 'personal',
                  word_id: 'gmail-personal',
                  status: 'ACTIVE',
                  status_reason: null,
                  is_disabled: false,
                  user_id: 'consumer-user-org_test',
                  toolkit: { slug: 'gmail' },
                  auth_config: {
                    id: 'ac_gmail_oauth',
                    auth_scheme: 'OAUTH2',
                    is_composio_managed: true,
                    is_disabled: false,
                  },
                  created_at: '2026-01-02T00:00:00.000Z',
                  updated_at: '2026-01-02T00:00:00.000Z',
                  test_request_endpoint: '',
                },
              ],
            },
            toolRouter: {
              create: (params: SessionCreateParams) =>
                Effect.sync(() => {
                  createParams = params;
                  return {
                    session_id: 'trs_proxy_test',
                    config: {
                      user_id: params.user_id,
                      execute: {},
                      search: {},
                      preload: { tools: [] },
                      instant: false,
                    },
                    config_version: 1,
                    mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
                    tool_router_tools: [],
                  };
                }),
              proxyExecute: (
                sessionId: string,
                params: SessionProxyExecuteParams,
                options?: RequestOptions
              ) =>
                Effect.sync(() => {
                  proxyParams = { sessionId, params };
                  proxyOptions = options;
                  return {
                    result_type: 'completed' as const,
                    status: 200,
                    data: {
                      ok: true,
                      endpoint: params.endpoint,
                      method: params.method,
                    },
                    headers: { 'content-type': 'application/json' },
                  };
                }),
            },
          });

          const output = yield* Effect.gen(function* () {
            yield* cli([
              'proxy',
              'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
              '--toolkit',
              'gmail',
              '--account',
              'work',
              '-X',
              'post',
              '-H',
              'content-type: application/json',
              '-d',
              '{ "message": { "raw": "abc" } }',
            ]);
            const lines = yield* MockConsole.getLines({ stripAnsi: true });
            return lines.join('\n');
          }).pipe(Effect.provide(live));

          expect(createParams).toEqual({
            user_id: 'consumer-user-org_test',
            connected_accounts: { gmail: 'con_gmail_work' },
            manage_connections: { enable: false },
            toolkits: { enable: ['gmail'] },
            instant: { return_instant_charge: true },
          });
          expect(proxyParams).toEqual({
            sessionId: 'trs_proxy_test',
            params: {
              toolkit_slug: 'gmail',
              endpoint: 'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
              method: 'POST',
              body: { message: { raw: 'abc' } },
              parameters: [
                {
                  name: 'content-type',
                  type: 'header',
                  value: 'application/json',
                },
              ],
            },
          });
          // A proxied call does not ask for retries, so the client sends it
          // once: a retry after the upstream API already acted would duplicate
          // the side effect.
          expect(proxyOptions).toBeUndefined();

          expect(output).toContain('Status: 200');
          expect(output).toContain('"ok": true');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] no --account and several connected accounts, none aliased default [Then] proxy fails instead of silently picking one',
    it => {
      it.effect('fails before creating a session', () =>
        Effect.gen(function* () {
          let createCalled = false;
          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            fixture: 'global-test-user-id',
            cliUserConfig: { experimentalFeatures: { multi_account: false } },
            connectedAccountsData: {
              items: [
                {
                  id: 'con_gmail_work',
                  alias: 'work',
                  word_id: 'gmail-work',
                  status: 'ACTIVE',
                  status_reason: null,
                  is_disabled: false,
                  user_id: 'consumer-user-org_test',
                  toolkit: { slug: 'gmail' },
                  auth_config: {
                    id: 'ac_gmail_oauth',
                    auth_scheme: 'OAUTH2',
                    is_composio_managed: true,
                    is_disabled: false,
                  },
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-01T00:00:00.000Z',
                  test_request_endpoint: '',
                },
                {
                  id: 'con_gmail_personal',
                  alias: 'personal',
                  word_id: 'gmail-personal',
                  status: 'ACTIVE',
                  status_reason: null,
                  is_disabled: false,
                  user_id: 'consumer-user-org_test',
                  toolkit: { slug: 'gmail' },
                  auth_config: {
                    id: 'ac_gmail_oauth',
                    auth_scheme: 'OAUTH2',
                    is_composio_managed: true,
                    is_disabled: false,
                  },
                  created_at: '2026-01-02T00:00:00.000Z',
                  updated_at: '2026-01-02T00:00:00.000Z',
                  test_request_endpoint: '',
                },
              ],
            },
            toolRouter: {
              create: (_params: SessionCreateParams) =>
                Effect.sync(() => {
                  createCalled = true;
                  return {
                    session_id: 'trs_proxy_test',
                    config: {
                      user_id: 'consumer-user-org_test',
                      execute: {},
                      search: {},
                      preload: { tools: [] },
                      instant: false,
                    },
                    config_version: 1,
                    mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
                    tool_router_tools: [],
                  };
                }),
            },
          });

          const failure = yield* Effect.gen(function* () {
            return yield* cli([
              'proxy',
              'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
              '--toolkit',
              'gmail',
              '--skip-connection-check',
              '-X',
              'post',
            ]).pipe(Effect.flip);
          }).pipe(Effect.provide(live));

          expect(createCalled).toBe(false);
          expect(String(failure)).toContain(
            'Multiple connected accounts exist for toolkit "gmail"'
          );
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] cached missing toolkit [Then] proxy fails fast before session creation',
    it => {
      it.effect('uses the connected toolkit cache keyed by toolkit', () =>
        Effect.gen(function* () {
          const refreshSpy = vi
            .spyOn(consumerShortTermCache, 'refreshConsumerConnectedToolkitsCache')
            .mockReturnValue(Effect.void);
          const getFreshSpy = vi
            .spyOn(consumerShortTermCache, 'getFreshConsumerConnectedToolkitsFromCache')
            .mockReturnValue(Effect.succeed(Option.some(['slack'])));

          let createCalled = false;
          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            fixture: 'global-test-user-id',
            toolRouter: {
              create: (_params: SessionCreateParams) =>
                Effect.sync(() => {
                  createCalled = true;
                  return {
                    session_id: 'trs_proxy_test',
                    config: {
                      user_id: 'global_test_user_id',
                      execute: {},
                      search: {},
                      preload: { tools: [] },
                      instant: false,
                    },
                    config_version: 1,
                    mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
                    tool_router_tools: [],
                  };
                }),
            },
          });

          const { failure, output } = yield* Effect.gen(function* () {
            const failure = yield* cli([
              'proxy',
              'https://gmail.googleapis.com/gmail/v1/users/me/profile',
              '--toolkit',
              'gmail',
            ]).pipe(Effect.flip);
            const lines = yield* MockConsole.getLines({ stripAnsi: true });
            return { failure, output: lines.join('\n') };
          }).pipe(Effect.provide(live));

          expect(createCalled).toBe(false);
          expect(failure).toBeInstanceOf(ReportedProxyCommandError);
          expect(failure).toMatchObject({ toolkit: 'gmail' });

          expect(output).toContain('Toolkit "gmail" is not connected for this user');
          expect(output).toContain('composio link gmail');
          expect(refreshSpy).toHaveBeenCalled();
          expect(getFreshSpy).toHaveBeenCalled();
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] backend 4302 no-connection error [Then] proxy rewrites it to link guidance',
    it => {
      it.effect('translates proxy_execute connection errors like execute does', () =>
        Effect.gen(function* () {
          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            fixture: 'global-test-user-id',
            toolRouter: {
              proxyExecute: () =>
                Effect.fail(
                  new BadRequestError({
                    message: `400 ${JSON.stringify({ error: noActiveConnection })}`,
                    method: 'POST',
                    url: 'https://mock.invalid/api/v3.1/tool_router/session/{session_id}/proxy_execute',
                    status: 400,
                    requestId: undefined,
                    details: noActiveConnection,
                    body: { error: noActiveConnection },
                  })
                ),
            },
          });

          const { failure, output } = yield* Effect.gen(function* () {
            const failure = yield* cli([
              'proxy',
              'https://gmail.googleapis.com/gmail/v1/users/me/profile',
              '--toolkit',
              'gmail',
              '--skip-connection-check',
            ]).pipe(Effect.flip);
            const lines = yield* MockConsole.getLines({ stripAnsi: true });
            return { failure, output: lines.join('\n') };
          }).pipe(Effect.provide(live));

          expect(failure).toMatchObject({
            name: 'ComposioNoActiveConnectionError',
            toolkit: 'gmail',
          });

          expect(output).toContain('No active connection found for toolkit "gmail"');
          expect(output).toContain('composio link gmail');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] proxy_execute asks for user input [Then] proxy fails without a response',
    it => {
      it.effect('reports that the proxied call requires user input', () =>
        Effect.gen(function* () {
          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            fixture: 'global-test-user-id',
            toolRouter: {
              proxyExecute: () =>
                Effect.succeed({
                  result_type: 'input_required' as const,
                  input_requests: {
                    approval_1: {
                      type: 'elicitation' as const,
                      mode: 'form' as const,
                      message: 'Allow this request to Gmail?',
                      requested_schema: { type: 'object' },
                    },
                  },
                  request_state: 'opaque-state-token',
                }),
            },
          });

          const { failure, output } = yield* Effect.gen(function* () {
            const failure = yield* cli([
              'proxy',
              'https://gmail.googleapis.com/gmail/v1/users/me/profile',
              '--toolkit',
              'gmail',
              '--skip-connection-check',
            ]).pipe(Effect.flip);
            const lines = yield* MockConsole.getLines({ stripAnsi: true });
            return { failure, output: lines.join('\n') };
          }).pipe(Effect.provide(live));

          expect(failure).toMatchObject({ _tag: 'commands/ProxyRequestError' });
          expect(output).toContain(
            'GET proxy call via \\"gmail\\" requires user input before it can run (1 input request) and was not executed.'
          );
          expect(output).not.toContain('Status:');
          expect(output).not.toContain('opaque-state-token');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] a session hook blocks the proxied request [Then] proxy fails with the hook message',
    it => {
      it.effect('reports the hook that blocked the request', () =>
        Effect.gen(function* () {
          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            fixture: 'global-test-user-id',
            toolRouter: {
              proxyExecute: () =>
                Effect.succeed({
                  result_type: 'blocked' as const,
                  reason: { type: 'request_blocked' as const, hook_id: 'no_external_email' },
                  message: 'Blocked by session policy: No external email',
                }),
            },
          });

          const { failure, output } = yield* Effect.gen(function* () {
            const failure = yield* cli([
              'proxy',
              'https://gmail.googleapis.com/gmail/v1/users/me/profile',
              '--toolkit',
              'gmail',
              '--skip-connection-check',
            ]).pipe(Effect.flip);
            const lines = yield* MockConsole.getLines({ stripAnsi: true });
            return { failure, output: lines.join('\n') };
          }).pipe(Effect.provide(live));

          expect(failure).toMatchObject({ _tag: 'commands/ProxyRequestError' });
          expect(output).toContain(
            'GET proxy call via \\"gmail\\" was blocked by session hook \\"no_external_email\\": Blocked by session policy: No external email'
          );
          expect(output).not.toContain('Status:');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] an always_deny override on the default account [Then] proxy is denied before proxy_execute',
    it => {
      it.effect('gates on the account the session resolves when --account is omitted', () =>
        Effect.gen(function* () {
          vi.spyOn(toolPermissions, 'getConsumerPermissionSnapshot').mockImplementation(params =>
            Effect.succeed({
              orgId: params.orgId,
              projectId: params.projectId,
              consumerUserId: params.consumerUserId,
              enhancedControlsEnabled: true,
              permissions: {
                default: 'allow_all',
                overrides: { '*:con_gmail_work': 'always_deny' },
              },
              connectedAccountIds: [],
              fetchedAt: 1_767_225_600_000,
            })
          );

          let createParams: SessionCreateParams | undefined;
          let proxyCalled = false;
          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            fixture: 'global-test-user-id',
            cliUserConfig: { experimentalFeatures: { multi_account: false } },
            connectedAccountsData: {
              items: [
                {
                  id: 'con_gmail_work',
                  alias: 'work',
                  word_id: 'gmail-work',
                  status: 'ACTIVE',
                  status_reason: null,
                  is_disabled: false,
                  user_id: 'consumer-user-org_test',
                  toolkit: { slug: 'gmail' },
                  auth_config: {
                    id: 'ac_gmail_oauth',
                    auth_scheme: 'OAUTH2',
                    is_composio_managed: true,
                    is_disabled: false,
                  },
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-01T00:00:00.000Z',
                  test_request_endpoint: '',
                },
              ],
            },
            toolRouter: {
              create: (params: SessionCreateParams) =>
                Effect.sync(() => {
                  createParams = params;
                  return {
                    session_id: 'trs_proxy_test',
                    config: {
                      user_id: params.user_id,
                      execute: {},
                      search: {},
                      preload: { tools: [] },
                      instant: false,
                    },
                    config_version: 1,
                    mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
                    tool_router_tools: [],
                  };
                }),
              proxyExecute: () =>
                Effect.sync(() => {
                  proxyCalled = true;
                  return {
                    result_type: 'completed' as const,
                    status: 200,
                    data: { ok: true },
                    headers: { 'content-type': 'application/json' },
                  };
                }),
            },
          });

          const failure = yield* cli([
            'proxy',
            'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
            '--toolkit',
            'gmail',
            '-X',
            'post',
          ]).pipe(Effect.flip, Effect.provide(live));

          expect(createParams?.connected_accounts).toEqual({ gmail: 'con_gmail_work' });
          expect(failure).toBeInstanceOf(toolPermissions.ToolPermissionDeniedError);
          expect(failure).toMatchObject({ deniedBy: 'permissions', toolSlug: 'gmail' });
          expect(proxyCalled).toBe(false);
        })
      );
    }
  );

  // Formatting fixtures: standalone controls (BEL, DEL), CR/LF, a lone CR and a tab.
  const remoteText = 'first line\r\nsecond\tcol\u0007 \u007f end\rover';

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] a text response with controls, stdout redirected and stderr a terminal',
    it => {
      it.effect('[Then] the note escapes them and stdout gets the body as it is', () =>
        Effect.gen(function* () {
          const terminal = redirectedTerminalUI({ decoratedStderr: true });
          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            fixture: 'global-test-user-id',
            toolRouter: {
              proxyExecute: () =>
                Effect.succeed({
                  result_type: 'completed' as const,
                  status: 200,
                  data: remoteText,
                  headers: { 'content-type': 'text/plain' },
                }),
            },
          });

          yield* cli([
            'proxy',
            'https://gmail.googleapis.com/gmail/v1/users/me/profile',
            '--toolkit',
            'gmail',
            '--skip-connection-check',
          ]).pipe(Effect.provide(terminal.layer), Effect.provide(live));

          expect(terminal.stdout()).toBe(`${remoteText}\n`);
          const stderr = terminal.stderr();
          expect(stderr).toContain('Proxy Response');
          expect(stderr).toContain('first line');
          expect(stderr).toContain('second\tcol\\u0007 \\u007f end\\u000dover');
          expect(stderr).not.toMatch(/[\u0007\u007f]/u);
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] a blocked request whose message has controls',
    it => {
      it.effect('[Then] stderr shows it escaped and the stdout JSON keeps the message', () =>
        Effect.gen(function* () {
          const terminal = redirectedTerminalUI({ decoratedStderr: true });
          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            fixture: 'global-test-user-id',
            toolRouter: {
              proxyExecute: () =>
                Effect.succeed({
                  result_type: 'blocked' as const,
                  reason: { type: 'request_blocked' as const, hook_id: 'policy' },
                  message: remoteText,
                }),
            },
          });

          const failure = yield* cli([
            'proxy',
            'https://gmail.googleapis.com/gmail/v1/users/me/profile',
            '--toolkit',
            'gmail',
            '--skip-connection-check',
          ]).pipe(Effect.provide(terminal.layer), Effect.flip, Effect.provide(live));

          expect(failure).toMatchObject({ _tag: 'commands/ProxyRequestError' });
          const result = JSON.parse(terminal.stdout()) as { readonly error: string };
          expect(result.error).toBe(
            `GET proxy call via "gmail" was blocked by session hook "policy": ${remoteText}`
          );
          const stderr = terminal.stderr();
          expect(stderr).toContain(
            'blocked by session hook "policy": first line\\u000d\\u000asecond\\u0009col\\u0007 \\u007f end\\u000dover'
          );
          expect(stderr).not.toMatch(/[\u0007\u007f]/u);
        })
      );
    }
  );
});
