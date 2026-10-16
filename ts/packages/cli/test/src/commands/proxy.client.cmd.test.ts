import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import {
  routeRequests,
  stubClientResources,
  type StubRequest,
} from 'test/__utils__/services/stub-composio-client';

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

const testLayer = TestLive({
  baseConfigProvider: testConfigProvider,
  fixture: 'global-test-user-id',
});

const ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
const proxyArgs = ['proxy', ENDPOINT, '--toolkit', 'gmail', '--skip-connection-check'];

const PROXY_EXECUTE = '/api/v3.1/tool_router/session/trs_stub_session/proxy_execute';

const isProxyExecute = (request: StubRequest) => request.path === PROXY_EXECUTE;

/** Proxy calls answered by `respond`; the session they run in is created normally. */
const proxyingOver = (respond: () => Response) =>
  stubClientResources(
    ['toolRouter'],
    routeRequests([{ method: 'POST', path: PROXY_EXECUTE, respond }], () =>
      Response.json({
        session_id: 'trs_stub_session',
        config: { user_id: 'consumer-user-org_test' },
        mcp: { type: 'http', url: 'https://mcp.stub.invalid' },
        tool_router_tools: [],
      })
    )
  );

const consoleOutput = MockConsole.getLines({ stripAnsi: true }).pipe(
  Effect.map(lines => lines.join('\n'))
);

describe('CLI: composio proxy over the API client', () => {
  layer(testLayer)('[Given] the API rejects the proxied call with an error envelope', it => {
    it.effect('[Then] the envelope message and slug are printed and the command fails', () =>
      Effect.gen(function* () {
        const stub = proxyingOver(() =>
          Response.json(
            {
              error: {
                message: 'The endpoint is not allowed for this toolkit',
                code: 4311,
                slug: 'ToolRouterV2_ProxyEndpointNotAllowed',
                status: 403,
              },
            },
            { status: 403 }
          )
        );
        const failure = yield* cli(proxyArgs).pipe(Effect.provide(stub.layer), Effect.flip);
        const output = yield* consoleOutput;

        expect(failure).toMatchObject({
          _tag: 'commands/ProxyRequestError',
          message: `Failed to proxy GET ${ENDPOINT} via "gmail".`,
        });
        expect(output).toContain('The endpoint is not allowed for this toolkit');
        expect(output).toContain(
          JSON.stringify(
            {
              successful: false,
              error: 'The endpoint is not allowed for this toolkit',
              toolkit: 'gmail',
              endpoint: ENDPOINT,
              slug: 'ToolRouterV2_ProxyEndpointNotAllowed',
            },
            null,
            2
          )
        );
        expect(output).not.toContain('Status:');
      })
    );
  });

  layer(testLayer)('[Given] the proxied API answers with a 404', it => {
    it.effect('[Then] the status and body are printed and the command succeeds', () =>
      Effect.gen(function* () {
        const stub = proxyingOver(() =>
          Response.json({
            status: 404,
            data: { error: { code: 404, message: 'Requested entity was not found.' } },
            headers: {},
          })
        );
        yield* cli(proxyArgs).pipe(Effect.provide(stub.layer));
        const output = yield* consoleOutput;

        expect(output).toContain('Status: 404');
        expect(output).toContain('"message": "Requested entity was not found."');
      })
    );
  });

  // On the live clock: a retry waits on the clock, and under the test clock a
  // retried call would hang instead of failing this test.
  layer(testLayer, { excludeTestServices: true })(
    '[Given] the API answers the proxied call with a 500',
    it => {
      it.effect('[Then] the call is attempted once', () =>
        Effect.gen(function* () {
          const stub = proxyingOver(() =>
            Response.json(
              { error: { message: 'Internal error', code: 500, slug: 'Internal', status: 500 } },
              // A retry would wait this long, so one that did happen shows up as a second request.
              { status: 500, headers: { 'retry-after-ms': '0' } }
            )
          );
          const failure = yield* cli(proxyArgs).pipe(Effect.provide(stub.layer), Effect.flip);
          const output = yield* consoleOutput;

          expect(failure).toMatchObject({
            _tag: 'commands/ProxyRequestError',
            message: `Failed to proxy GET ${ENDPOINT} via "gmail".`,
          });
          expect(output).toContain('Internal error');
          expect(stub.requests.filter(isProxyExecute)).toMatchObject([
            { method: 'POST', body: { toolkit_slug: 'gmail', endpoint: ENDPOINT, method: 'GET' } },
          ]);
        })
      );
    }
  );
});
