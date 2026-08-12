import { describe, expect, it, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Exit, Option } from 'effect';
import { afterEach, vi } from 'vitest';
import type {
  SessionCreateParams,
  SessionProxyExecuteParams,
} from '@composio/client/resources/tool-router';
import { extendConfigProvider } from 'src/services/config';
import {
  normalizeProxyMethod,
  parseProxyBody,
  parseProxyHeader,
  ProxyCommandError,
} from 'src/commands/proxy.cmd';
import * as consumerShortTermCache from 'src/services/consumer-short-term-cache';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

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

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] curl-like proxy flags [Then] it creates a scoped session and forwards proxy_execute',
    it => {
      it.scoped('forwards proxy execute params and prints the response', () =>
        Effect.gen(function* () {
          let createParams: SessionCreateParams | undefined;
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
              create: async (params: SessionCreateParams) => {
                createParams = params;
                return {
                  session_id: 'trs_proxy_test',
                  config: {
                    user_id: params.user_id,
                    execute: {},
                    search: {},
                    preload: { tools: [] },
                  },
                  config_version: 1,
                  mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
                  tool_router_tools: [],
                };
              },
              proxyExecute: async (sessionId: string, params: SessionProxyExecuteParams) => {
                proxyParams = { sessionId, params };
                return {
                  status: 200,
                  data: {
                    ok: true,
                    endpoint: params.endpoint,
                    method: params.method,
                  },
                  headers: { 'content-type': 'application/json' },
                };
              },
            },
          });

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
          ]).pipe(Effect.provide(live));

          expect(createParams).toEqual({
            user_id: 'consumer-user-org_test',
            connected_accounts: { gmail: 'con_gmail_work' },
            manage_connections: { enable: false },
            toolkits: { enable: ['gmail'] },
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

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('Status: 200');
          expect(output).toContain('"ok": true');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, fixture: 'global-test-user-id' }))(
    '[Given] cached missing toolkit [Then] proxy fails fast before session creation',
    it => {
      it.scoped('uses the connected toolkit cache keyed by toolkit', () =>
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
              create: async (_params: SessionCreateParams) => {
                createCalled = true;
                return {
                  session_id: 'trs_proxy_test',
                  config: {
                    user_id: 'global_test_user_id',
                    execute: {},
                    search: {},
                    preload: { tools: [] },
                  },
                  config_version: 1,
                  mcp: { type: 'http' as const, url: 'https://mcp.test.composio.dev' },
                  tool_router_tools: [],
                };
              },
            },
          });

          const failure = yield* cli([
            'proxy',
            'https://gmail.googleapis.com/gmail/v1/users/me/profile',
            '--toolkit',
            'gmail',
          ]).pipe(Effect.provide(live), Effect.flip);

          expect(createCalled).toBe(false);
          expect(failure).toBeInstanceOf(ProxyCommandError);
          if (failure instanceof ProxyCommandError) {
            expect(failure.reason).toBe('toolkit_not_connected');
            expect(failure.toolkit).toBe('gmail');
          }

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
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
      it.scoped('translates proxy_execute connection errors like execute does', () =>
        Effect.gen(function* () {
          const live = TestLive({
            baseConfigProvider: testConfigProvider,
            fixture: 'global-test-user-id',
            toolRouter: {
              proxyExecute: async () => {
                throw {
                  message: 'raw backend error',
                  details: {
                    code: 4302,
                    slug: 'ToolRouterV2_NoActiveConnection',
                    message: 'No active connection',
                  },
                };
              },
            },
          });

          const exit = yield* cli([
            'proxy',
            'https://gmail.googleapis.com/gmail/v1/users/me/profile',
            '--toolkit',
            'gmail',
            '--skip-connection-check',
          ]).pipe(Effect.provide(live), Effect.exit);

          expect(Exit.isFailure(exit)).toBe(true);

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          expect(output).toContain('No active connection found for toolkit "gmail"');
          expect(output).toContain('composio link gmail');
        })
      );
    }
  );
});
