import { APIError } from '@composio/client';
import { Config, Context, Data, Duration, Effect, Layer, Option, Result, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import * as constants from 'src/constants';
import { readInstallIdWhenTelemetryEnabled } from 'src/analytics/dispatch';
import { APP_CONFIG } from 'src/effects/app-config';
import { cliRequestHeaders } from 'src/services/client-provenance';
import { ComposioUserContext } from 'src/services/user-context';
import { toolInputRequiredError } from 'src/utils/tool-input-required';

export interface DashboardToolExecutionRequest {
  readonly slug: string;
  readonly arguments: Record<string, unknown>;
  /** Sent as `x-org-id`; the Dashboard resolves the consumer project from it. */
  readonly orgId: string;
  /** Connected account to run an app tool with; the Dashboard's sessions are multi-account. */
  readonly account?: string;
}

export class DashboardToolExecutionError extends Data.TaggedError(
  'services/DashboardToolExecutionError'
)<{
  readonly message: string;
  /**
   * - `unauthorized`: the Dashboard rejected the stored login, or there is none.
   * - `dashboard`: the Dashboard reported a failure of its own.
   * - `request`: no response arrived.
   * - `response`: the response was not one the CLI understands.
   * - `timeout`: no complete response arrived within the deadline.
   * - `configuration`: the Dashboard URL is not one the CLI will send a key to.
   */
  readonly reason:
    'unauthorized' | 'dashboard' | 'request' | 'response' | 'timeout' | 'configuration';
  readonly status?: number;
  /** The Dashboard's error code, e.g. `UNAUTHORIZED`. */
  readonly code?: string;
  readonly cause?: unknown;
}> {}

const JsonObject = Schema.Record(Schema.String, Schema.Unknown);

const ExecutionResult = Schema.Struct({
  result_type: Schema.optional(Schema.Literals(['completed', 'failed'])),
  data: JsonObject,
  error: Schema.NullOr(Schema.String),
  log_id: Schema.String,
});

const ExecutionResponse = Schema.Union([
  ExecutionResult,
  Schema.Struct({
    result_type: Schema.Literal('input_required'),
    input_requests: Schema.Record(
      Schema.String,
      Schema.Struct({
        type: Schema.Literal('elicitation'),
        mode: Schema.Literal('form'),
        message: Schema.String,
        requested_schema: JsonObject,
      })
    ),
    request_state: Schema.optional(Schema.String),
  }),
]);

// Fields beyond the named ones (a validation failure's `errors`, say) are kept,
// so the rebuilt `APIError` carries the same body the backend sent.
const ApiErrorEnvelope = Schema.StructWithRest(
  Schema.Struct({
    message: Schema.String,
    code: Schema.optional(Schema.Number),
    slug: Schema.optional(Schema.String),
    status: Schema.optional(Schema.Number),
    request_id: Schema.optional(Schema.String),
    suggested_fix: Schema.optional(Schema.String),
  }),
  [JsonObject]
);

const ExecutionOutcome = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), response: ExecutionResponse }),
  Schema.Struct({ ok: Schema.Literal(false), status: Schema.Number, error: ApiErrorEnvelope }),
]);

const ProcedureReply = Schema.Union([
  Schema.Struct({
    result: Schema.Struct({ data: Schema.Struct({ json: ExecutionOutcome }) }),
  }),
  Schema.Struct({
    error: Schema.Struct({
      json: Schema.Struct({
        message: Schema.String,
        data: Schema.optional(
          Schema.Struct({
            code: Schema.optional(Schema.String),
            httpStatus: Schema.optional(Schema.Number),
          })
        ),
      }),
    }),
  }),
]);

const decodeProcedureReply = Schema.decodeUnknownEffect(Schema.fromJsonString(ProcedureReply));

const withoutTrailingSlashes = (url: string) => url.replace(/\/+$/, '');

const LOGIN_HINT = 'Run `composio login`, then retry.';

/**
 * Covers the POST and reading its body. The Dashboard allows a tool up to 800
 * seconds, so anything still pending after this is not coming.
 */
const DASHBOARD_REQUEST_TIMEOUT = Duration.minutes(15);

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

// Fixed text: the configured value may itself hold a secret, so it is never echoed.
const INVALID_DASHBOARD_URL_MESSAGE =
  'The Composio Dashboard URL (COMPOSIO_WEB_URL) must be an https:// URL with no credentials, query string, or fragment; http:// is accepted only for localhost. Nothing was sent.';

/**
 * The Dashboard base the user API key may be sent to: `origin` for messages,
 * `base` for building request URLs. Rejects a URL that would put the key on
 * the wire in clear text, or that carries anything beyond scheme, host and path.
 */
const resolveDashboardBase = (webURL: string) =>
  Result.try({
    try: () => new URL(webURL),
    catch: () => undefined,
  }).pipe(
    Result.filterOrFail(
      url =>
        url.username === '' &&
        url.password === '' &&
        !webURL.includes('?') &&
        !webURL.includes('#') &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname))),
      () => undefined
    ),
    Result.map(url => ({
      origin: url.origin,
      base: `${url.origin}${withoutTrailingSlashes(url.pathname)}`,
    })),
    Result.mapError(
      () =>
        new DashboardToolExecutionError({
          reason: 'configuration',
          message: INVALID_DASHBOARD_URL_MESSAGE,
        })
    )
  );

/**
 * Which transport a consumer execution uses. The Dashboard is the default; a
 * backend URL that was overridden without a matching `COMPOSIO_WEB_URL` keeps
 * the backend transport, so a key for one deployment is never sent to another
 * deployment's Dashboard.
 */
export const resolveConsumerExecutionTransport = Effect.gen(function* () {
  const webURL = yield* Config.option(Config.String('WEB_URL'));
  if (Option.isSome(webURL)) return 'dashboard' as const;

  const baseURL = yield* Config.option(Config.String('BASE_URL'));
  if (Option.isNone(baseURL)) return 'dashboard' as const;

  const environment = yield* APP_CONFIG.ENVIRONMENT;
  const environmentBaseURL =
    Option.getOrUndefined(environment) === 'staging'
      ? constants.STAGING_BASE_URL
      : constants.DEFAULT_BASE_URL;

  return withoutTrailingSlashes(baseURL.value) === withoutTrailingSlashes(environmentBaseURL)
    ? ('dashboard' as const)
    : ('backend' as const);
});

const makeDashboardToolExecution = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const userContext = yield* ComposioUserContext;

  const call = (
    procedure: 'execute' | 'executeMeta',
    orgId: string,
    input: Record<string, unknown>
  ) =>
    Effect.gen(function* () {
      // Read per call: a login earlier in the same process changes the key.
      const { apiKey, webURL } = userContext.data;
      if (Option.isNone(apiKey)) {
        return yield* new DashboardToolExecutionError({
          reason: 'unauthorized',
          message: `You are not logged in. ${LOGIN_HINT}`,
        });
      }

      // Checked before the key is attached to anything.
      const dashboard = yield* Effect.fromResult(resolveDashboardBase(webURL));
      // Lets the Dashboard's product analytics join the CLI's own events. Sent
      // only while telemetry is enabled, and only on these requests.
      const installId = yield* readInstallIdWhenTelemetryEnabled;
      const request = HttpClientRequest.post(`${dashboard.base}/api/cli/trpc/${procedure}`).pipe(
        HttpClientRequest.setHeaders({
          ...cliRequestHeaders(),
          accept: 'application/json',
          authorization: `Bearer ${apiKey.value}`,
          'x-org-id': orgId,
          ...(Option.isSome(installId) ? { 'x-cli-install-id': installId.value } : {}),
        }),
        HttpClientRequest.bodyJsonUnsafe({ json: input })
      );

      // Sent exactly once: a retry, or a redirect followed by re-posting, could
      // run a tool that already acted.
      const { response, reply } = yield* Effect.gen(function* () {
        const response = yield* httpClient.execute(request).pipe(
          Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }),
          Effect.mapError(
            cause =>
              new DashboardToolExecutionError({
                reason: 'request',
                message: `Could not reach the Composio Dashboard at ${dashboard.origin}. The request was not retried; if the tool may have already run, check before running it again.`,
                cause,
              })
          )
        );
        const reply = yield* response.text.pipe(
          Effect.flatMap(decodeProcedureReply),
          Effect.mapError(
            cause =>
              new DashboardToolExecutionError({
                reason: 'response',
                status: response.status,
                message: `The Composio Dashboard at ${dashboard.origin} returned an unexpected response (HTTP ${response.status}). The request was not retried.`,
                cause,
              })
          )
        );
        return { response, reply };
      }).pipe(
        // Expiry interrupts the request, which aborts it; nothing is resent.
        Effect.timeoutOrElse({
          duration: DASHBOARD_REQUEST_TIMEOUT,
          orElse: () =>
            Effect.fail(
              new DashboardToolExecutionError({
                reason: 'timeout',
                message: `The Composio Dashboard at ${dashboard.origin} did not answer within ${Duration.toMinutes(DASHBOARD_REQUEST_TIMEOUT)} minutes. The tool may still have run; check before running it again. The request was not retried.`,
              })
            ),
        })
      );

      if ('error' in reply) {
        const failure = reply.error.json;
        const unauthorized = failure.data?.code === 'UNAUTHORIZED';
        return yield* new DashboardToolExecutionError({
          reason: unauthorized ? 'unauthorized' : 'dashboard',
          status: failure.data?.httpStatus ?? response.status,
          code: failure.data?.code,
          message: unauthorized
            ? `Authentication failed: ${failure.message}. ${LOGIN_HINT}`
            : failure.message,
        });
      }

      const outcome = reply.result.data.json;
      if (!outcome.ok) {
        // The same error `@composio/client` raises for this backend response, so
        // error mapping, connection tips and telemetry need no second code path.
        return yield* Effect.fail(
          APIError.generate(outcome.status, { error: outcome.error }, undefined, new Headers())
        );
      }
      if (outcome.response.result_type === 'input_required') {
        return yield* toolInputRequiredError(
          `Tool ${input.tool_slug ?? input.slug}`,
          outcome.response
        );
      }
      return outcome.response;
    });

  return {
    /** Runs a tool through the Dashboard. Never retried. */
    execute: (request: DashboardToolExecutionRequest) =>
      call('execute', request.orgId, {
        tool_slug: request.slug,
        arguments: request.arguments,
        ...(request.account ? { account: request.account } : {}),
      }),
    /** Runs a meta tool through the Dashboard. Never retried. */
    executeMeta: (request: DashboardToolExecutionRequest) =>
      call('executeMeta', request.orgId, {
        slug: request.slug,
        arguments: request.arguments,
      }),
  } as const;
});

export type DashboardToolExecutionShape = Effect.Success<typeof makeDashboardToolExecution>;

/**
 * Sends consumer tool executions to the Composio Dashboard, which runs them on
 * the backend and relays the backend's answer.
 */
export class DashboardToolExecution extends Context.Service<
  DashboardToolExecution,
  DashboardToolExecutionShape
>()('services/DashboardToolExecution') {
  static readonly Default = Layer.effect(DashboardToolExecution, makeDashboardToolExecution);
}
