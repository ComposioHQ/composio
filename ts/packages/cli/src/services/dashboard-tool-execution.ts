import { APIError } from '@composio/client';
import { Config, Context, Data, Effect, Layer, Option, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import * as constants from 'src/constants';
import { APP_CONFIG } from 'src/effects/app-config';
import { cliRequestHeaders } from 'src/services/client-provenance';
import { ComposioUserContext } from 'src/services/user-context';

/**
 * The session settings the Dashboard accepts from the CLI. The Dashboard
 * rejects any other key, and resolves the session's user itself.
 */
export interface DashboardSessionConfig {
  readonly auth_configs?: Record<string, string>;
  readonly connected_accounts?: Record<string, string>;
  readonly manage_connections?: { readonly enable: boolean };
  readonly experimental?: { readonly link_url_overwrite?: string };
}

export interface DashboardToolExecutionRequest {
  readonly slug: string;
  readonly arguments: Record<string, unknown>;
  /** Sent as `x-org-id`; the Dashboard resolves the consumer project from it. */
  readonly orgId: string;
  readonly session?: DashboardSessionConfig;
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
   */
  readonly reason: 'unauthorized' | 'dashboard' | 'request' | 'response';
  readonly status?: number;
  /** The Dashboard's error code, e.g. `UNAUTHORIZED`. */
  readonly code?: string;
  readonly cause?: unknown;
}> {}

const JsonObject = Schema.Record(Schema.String, Schema.Unknown);

const ExecutionResponse = Schema.Struct({
  data: JsonObject,
  error: Schema.NullOr(Schema.String),
  log_id: Schema.String,
});
export type DashboardExecutionResponse = typeof ExecutionResponse.Type;

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

      const dashboardURL = withoutTrailingSlashes(webURL);
      const request = HttpClientRequest.post(`${dashboardURL}/api/cli/trpc/${procedure}`).pipe(
        HttpClientRequest.setHeaders({
          ...cliRequestHeaders(),
          accept: 'application/json',
          authorization: `Bearer ${apiKey.value}`,
          'x-org-id': orgId,
        }),
        HttpClientRequest.bodyJsonUnsafe({ json: input })
      );

      // Sent exactly once: a retry, or a redirect followed by re-posting, could
      // run a tool that already acted.
      const response = yield* httpClient.execute(request).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }),
        Effect.mapError(
          cause =>
            new DashboardToolExecutionError({
              reason: 'request',
              message: `Could not reach the Composio Dashboard at ${dashboardURL}. The request was not retried; if the tool may have already run, check before running it again.`,
              cause,
            })
        )
      );

      const unexpectedResponse = (cause: unknown) =>
        new DashboardToolExecutionError({
          reason: 'response',
          status: response.status,
          message: `The Composio Dashboard at ${dashboardURL} returned an unexpected response (HTTP ${response.status}). The request was not retried.`,
          cause,
        });

      const reply = yield* response.text.pipe(
        Effect.flatMap(decodeProcedureReply),
        Effect.mapError(unexpectedResponse)
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
      return outcome.response;
    });

  const session = (request: DashboardToolExecutionRequest) =>
    request.session ? { session: request.session } : {};

  return {
    /** Runs a tool through the Dashboard. Never retried. */
    execute: (request: DashboardToolExecutionRequest) =>
      call('execute', request.orgId, {
        tool_slug: request.slug,
        arguments: request.arguments,
        ...session(request),
      }),
    /** Runs a meta tool through the Dashboard. Never retried. */
    executeMeta: (request: DashboardToolExecutionRequest) =>
      call('executeMeta', request.orgId, {
        slug: request.slug,
        arguments: request.arguments,
        ...session(request),
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
