import { describe, expect, it } from '@effect/vitest';
import { APIError } from '@composio/client';
import { ConfigProvider, Deferred, Effect, Fiber, Layer, Option } from 'effect';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientError,
  HttpClientResponse,
  type HttpClientRequest,
} from 'effect/unstable/http';
import {
  DashboardToolExecution,
  DashboardToolExecutionError,
  resolveConsumerExecutionTransport,
} from 'src/services/dashboard-tool-execution';
import { extendConfigProvider } from 'src/services/config';
import { ComposioUserContext } from 'src/services/user-context';
import { extractApiErrorDetails } from 'src/utils/api-error-extraction';

interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly signal: AbortSignal;
}

type Respond = (
  request: HttpClientRequest.HttpClientRequest
) => Effect.Effect<Response, HttpClientError.HttpClientError>;

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const succeedWith =
  (outcome: unknown): Respond =>
  () =>
    Effect.succeed(jsonResponse(200, { result: { data: { json: outcome } } }));

const requestBody = (request: HttpClientRequest.HttpClientRequest): unknown =>
  request.body._tag === 'Uint8Array'
    ? JSON.parse(new TextDecoder().decode(request.body.body))
    : null;

const userContext = (overrides: { webURL?: string; apiKey?: Option.Option<string> } = {}) =>
  Layer.succeed(
    ComposioUserContext,
    ComposioUserContext.of({
      data: {
        apiKey: overrides.apiKey ?? Option.some('uak_test_key'),
        baseURL: 'https://backend.example.test',
        webURL: overrides.webURL ?? 'https://dashboard.example.test/',
        orgId: Option.some('org_test'),
        projectId: Option.none(),
        testUserId: Option.none(),
      },
      isLoggedIn: () => true,
      logout: Effect.void,
      login: () => Effect.void,
      update: () => Effect.void,
    })
  );

/** Runs `use` against the real service over a recording HTTP client. */
const withDashboard = <A, E>(
  respond: Respond,
  use: (
    dashboard: DashboardToolExecution['Service'],
    requests: ReadonlyArray<RecordedRequest>
  ) => Effect.Effect<A, E>,
  overrides?: Parameters<typeof userContext>[0]
) => {
  const requests: Array<RecordedRequest> = [];
  const httpClient = HttpClient.make((request, url, signal) => {
    requests.push({
      method: request.method,
      url: url.toString(),
      headers: { ...request.headers },
      body: requestBody(request),
      signal,
    });
    return respond(request).pipe(
      Effect.map(response => HttpClientResponse.fromWeb(request, response))
    );
  });

  return Effect.gen(function* () {
    const dashboard = yield* DashboardToolExecution;
    return yield* use(dashboard, requests);
  }).pipe(
    Effect.provide(
      DashboardToolExecution.Default.pipe(
        Layer.provide(
          Layer.mergeAll(Layer.succeed(HttpClient.HttpClient, httpClient), userContext(overrides))
        )
      )
    )
  );
};

const successOutcome = {
  ok: true,
  response: { data: { id: 'msg_1' }, error: null, log_id: 'log_dashboard' },
};

const executeRequest = {
  slug: 'GMAIL_SEND_EMAIL',
  arguments: { recipient: 'a@example.com' },
  orgId: 'org_test',
  session: {
    connected_accounts: { gmail: 'ca_1' },
    manage_connections: { enable: true },
  },
};

describe('DashboardToolExecution', () => {
  it.effect('posts a tool execution to the execute procedure and returns the relayed body', () =>
    withDashboard(succeedWith(successOutcome), (dashboard, requests) =>
      Effect.gen(function* () {
        const response = yield* dashboard.execute(executeRequest);

        expect(response).toEqual({ data: { id: 'msg_1' }, error: null, log_id: 'log_dashboard' });
        expect(requests).toHaveLength(1);
        const [request] = requests;
        expect(request?.method).toBe('POST');
        expect(request?.url).toBe('https://dashboard.example.test/api/cli/trpc/execute');
        expect(request?.headers['authorization']).toBe('Bearer uak_test_key');
        expect(request?.headers['x-org-id']).toBe('org_test');
        expect(request?.headers['content-type']).toBe('application/json');
        expect(request?.headers['x-source']).toBe('CLI');
        expect(request?.headers['x-user-api-key']).toBeUndefined();
        expect(request?.body).toEqual({
          json: {
            tool_slug: 'GMAIL_SEND_EMAIL',
            arguments: { recipient: 'a@example.com' },
            session: {
              connected_accounts: { gmail: 'ca_1' },
              manage_connections: { enable: true },
            },
          },
        });
      })
    )
  );

  it.effect('posts a meta tool to the executeMeta procedure under `slug`', () =>
    withDashboard(succeedWith(successOutcome), (dashboard, requests) =>
      Effect.gen(function* () {
        yield* dashboard.executeMeta({
          slug: 'COMPOSIO_SEARCH_TOOLS',
          arguments: { query: 'email' },
          orgId: 'org_test',
        });

        expect(requests[0]?.url).toBe('https://dashboard.example.test/api/cli/trpc/executeMeta');
        expect(requests[0]?.body).toEqual({
          json: { slug: 'COMPOSIO_SEARCH_TOOLS', arguments: { query: 'email' } },
        });
      })
    )
  );

  for (const webURL of ['https://web.example.test', 'https://web.example.test/']) {
    it.effect(`builds the same request URL from ${webURL}`, () =>
      withDashboard(
        succeedWith(successOutcome),
        (dashboard, requests) =>
          Effect.gen(function* () {
            yield* dashboard.execute(executeRequest);
            expect(requests[0]?.url).toBe('https://web.example.test/api/cli/trpc/execute');
          }),
        { webURL }
      )
    );
  }

  it.effect('rebuilds an API error from a relayed backend failure', () =>
    withDashboard(
      succeedWith({
        ok: false,
        status: 402,
        error: {
          message: 'Insufficient wallet balance',
          code: 4020,
          slug: 'Wallet_InsufficientBalance',
          status: 402,
          request_id: 'req_wallet',
          suggested_fix: 'Add credits and retry.',
        },
      }),
      dashboard =>
        Effect.gen(function* () {
          const failure = yield* dashboard.execute(executeRequest).pipe(Effect.flip);

          expect(failure).toBeInstanceOf(APIError);
          expect(extractApiErrorDetails(failure)).toEqual({
            message: 'Insufficient wallet balance',
            code: 4020,
            slug: 'Wallet_InsufficientBalance',
            status: 402,
            request_id: 'req_wallet',
            suggested_fix: 'Add credits and retry.',
          });
        })
    )
  );

  it.effect('suggests logging in when the Dashboard rejects the credentials', () =>
    withDashboard(
      () =>
        Effect.succeed(
          jsonResponse(401, {
            error: {
              json: {
                message: 'Invalid API key',
                data: { code: 'UNAUTHORIZED', httpStatus: 401 },
              },
            },
          })
        ),
      (dashboard, requests) =>
        Effect.gen(function* () {
          const failure = yield* dashboard.execute(executeRequest).pipe(Effect.flip);

          expect(failure).toBeInstanceOf(DashboardToolExecutionError);
          expect(failure).toMatchObject({ reason: 'unauthorized', status: 401 });
          expect(failure.message).toContain('Invalid API key');
          expect(failure.message).toContain('composio login');
          expect(requests).toHaveLength(1);
        })
    )
  );

  it.effect("reports the Dashboard's own message for its other failures", () =>
    withDashboard(
      () =>
        Effect.succeed(
          jsonResponse(502, {
            error: {
              json: {
                message: 'Tool execution is temporarily unavailable.',
                data: { code: 'BAD_GATEWAY', httpStatus: 502 },
              },
            },
          })
        ),
      (dashboard, requests) =>
        Effect.gen(function* () {
          const failure = yield* dashboard.execute(executeRequest).pipe(Effect.flip);

          expect(failure).toMatchObject({
            reason: 'dashboard',
            status: 502,
            code: 'BAD_GATEWAY',
            message: 'Tool execution is temporarily unavailable.',
          });
          expect(requests).toHaveLength(1);
        })
    )
  );

  it.effect('names the Dashboard host on a network failure and sends the request once', () =>
    withDashboard(
      request =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              request,
              cause: new Error('connect ECONNREFUSED'),
            }),
          })
        ),
      (dashboard, requests) =>
        Effect.gen(function* () {
          const failure = yield* dashboard.execute(executeRequest).pipe(Effect.flip);

          expect(failure).toMatchObject({ reason: 'request' });
          expect(failure.message).toContain('dashboard.example.test');
          expect(requests).toHaveLength(1);
        })
    )
  );

  it.effect('names the Dashboard host when the response is not JSON', () =>
    withDashboard(
      () => Effect.succeed(new Response('<html>Bad gateway</html>', { status: 502 })),
      (dashboard, requests) =>
        Effect.gen(function* () {
          const failure = yield* dashboard.execute(executeRequest).pipe(Effect.flip);

          expect(failure).toMatchObject({ reason: 'response', status: 502 });
          expect(failure.message).toContain('dashboard.example.test');
          expect(requests).toHaveLength(1);
        })
    )
  );

  it.effect('sends nothing when no user API key is stored', () =>
    withDashboard(
      succeedWith(successOutcome),
      (dashboard, requests) =>
        Effect.gen(function* () {
          const failure = yield* dashboard.execute(executeRequest).pipe(Effect.flip);

          expect(failure).toMatchObject({ reason: 'unauthorized' });
          expect(failure.message).toContain('composio login');
          expect(requests).toHaveLength(0);
        }),
      { apiKey: Option.none() }
    )
  );

  it.effect('tells fetch to fail on a redirect instead of re-posting the execution', () =>
    Effect.gen(function* () {
      const inits: Array<RequestInit | undefined> = [];
      const fetchStub: typeof globalThis.fetch = Object.assign(
        (_input: RequestInfo | URL, init?: RequestInit) => {
          inits.push(init);
          // What fetch does with `redirect: 'error'` when the server answers 307.
          return Promise.reject(new TypeError('unexpected redirect'));
        },
        { preconnect: () => undefined }
      );

      const failure = yield* Effect.gen(function* () {
        const dashboard = yield* DashboardToolExecution;
        return yield* dashboard.execute(executeRequest).pipe(Effect.flip);
      }).pipe(
        Effect.provide(
          DashboardToolExecution.Default.pipe(
            Layer.provide(Layer.mergeAll(FetchHttpClient.layer, userContext()))
          )
        ),
        Effect.provideService(FetchHttpClient.Fetch, fetchStub)
      );

      expect(inits).toHaveLength(1);
      expect(inits[0]?.redirect).toBe('error');
      expect(inits[0]?.method).toBe('POST');
      expect(failure).toMatchObject({ reason: 'request' });
    })
  );

  it.effect('aborts the in-flight request when the calling fiber is interrupted', () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();

      yield* withDashboard(
        () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        (dashboard, requests) =>
          Effect.gen(function* () {
            const fiber = yield* Effect.forkChild(dashboard.execute(executeRequest));
            yield* Deferred.await(started);
            expect(requests[0]?.signal.aborted).toBe(false);

            yield* Fiber.interrupt(fiber);

            expect(requests[0]?.signal.aborted).toBe(true);
            expect(requests).toHaveLength(1);
          })
      );
    })
  );
});

describe('resolveConsumerExecutionTransport', () => {
  const resolveWith = (env: Record<string, string>) =>
    resolveConsumerExecutionTransport.pipe(
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromEnv({ env }).pipe(extendConfigProvider))
      )
    );

  const cases: ReadonlyArray<{
    readonly name: string;
    readonly env: Record<string, string>;
    readonly expected: 'dashboard' | 'backend';
  }> = [
    { name: 'no overrides', env: {}, expected: 'dashboard' },
    {
      name: 'the staging environment',
      env: { COMPOSIO_ENVIRONMENT: 'staging' },
      expected: 'dashboard',
    },
    {
      name: 'the default backend URL spelled out',
      env: { COMPOSIO_BASE_URL: 'https://backend.composio.dev/' },
      expected: 'dashboard',
    },
    {
      name: 'a custom backend URL without a web URL',
      env: { COMPOSIO_BASE_URL: 'https://composio.internal.example' },
      expected: 'backend',
    },
    {
      name: 'a backend URL that does not match the selected environment',
      env: {
        COMPOSIO_ENVIRONMENT: 'staging',
        COMPOSIO_BASE_URL: 'https://backend.composio.dev',
      },
      expected: 'backend',
    },
    {
      name: 'a custom backend URL with a web URL',
      env: {
        COMPOSIO_BASE_URL: 'https://composio.internal.example',
        COMPOSIO_WEB_URL: 'https://dashboard.internal.example',
      },
      expected: 'dashboard',
    },
  ];

  for (const testCase of cases) {
    it.effect(`uses the ${testCase.expected} transport for ${testCase.name}`, () =>
      Effect.gen(function* () {
        expect(yield* resolveWith(testCase.env)).toBe(testCase.expected);
      })
    );
  }
});
