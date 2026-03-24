import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import type {
  SessionCreateParams,
  SessionProxyExecuteParams,
} from '@composio/client/resources/tool-router';
import { extendConfigProvider } from 'src/services/config';
import { normalizeProxyMethod, parseProxyBody, parseProxyHeader } from 'src/commands/proxy.cmd';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio proxy', () => {
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
            toolRouter: {
              create: async (params: SessionCreateParams) => {
                createParams = params;
                return {
                  session_id: 'trs_proxy_test',
                  config: { user_id: params.user_id },
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
            '-X',
            'post',
            '-H',
            'content-type: application/json',
            '-d',
            '{ "message": { "raw": "abc" } }',
          ]).pipe(Effect.provide(live));

          expect(createParams).toEqual({
            user_id: 'global_test_user_id',
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
});
