import { isAPIError, type ComposioClientShape } from '@composio/client/effect';
import type { SessionExecuteMetaParams } from '@composio/client/resources/tool-router';
import { Effect, Layer, Schema } from 'effect';
import { HttpClient, HttpClientError, HttpClientResponse } from 'effect/http';
import { DashboardToolExecution } from 'src/services/dashboard-tool-execution';

/** One request the CLI sent to the test Dashboard. */
export interface DashboardTestRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** The decoded JSON body, or `undefined` when there is none. */
  readonly body: unknown;
}

/** Answers a Dashboard request; a rejection reaches the CLI as a network failure. */
export type DashboardTestResponder = (
  request: DashboardTestRequest
) => Response | Promise<Response>;

const DashboardProcedureInput = Schema.Struct({
  json: Schema.Struct({
    tool_slug: Schema.optional(Schema.String),
    slug: Schema.optional(Schema.String),
    arguments: Schema.Record(Schema.String, Schema.Unknown),
    account: Schema.optional(Schema.String),
    session: Schema.optional(Schema.Unknown),
  }),
});

/** A Dashboard procedure answer in the wire envelope the CLI decodes. */
export const dashboardProcedureResult = (outcome: unknown, status = 200): Response =>
  Response.json({ result: { data: { json: outcome } } }, { status });

/** A Dashboard-level failure in the wire envelope the CLI decodes. */
export const dashboardProcedureError = (params: {
  readonly code: string;
  readonly httpStatus: number;
  readonly message: string;
}): Response =>
  Response.json(
    {
      error: {
        json: {
          message: params.message,
          data: { code: params.code, httpStatus: params.httpStatus },
        },
      },
    },
    { status: params.httpStatus }
  );

/**
 * What the real Dashboard does with a request: it creates a Tool Router
 * session itself and executes on `toolRouter`, relaying the answer, or a
 * backend 4xx as data. Session settings from the CLI are refused.
 */
export const relayThroughToolRouter =
  (toolRouter: ComposioClientShape['toolRouter']) => (request: DashboardTestRequest) =>
    Effect.gen(function* () {
      const { session, account, ...call } = Schema.decodeUnknownSync(DashboardProcedureInput)(
        request.body
      ).json;
      if (session !== undefined) {
        return dashboardProcedureError({
          code: 'BAD_REQUEST',
          httpStatus: 400,
          message: "Unrecognized key(s) in object: 'session'",
        });
      }
      const created = yield* toolRouter.session.create({ user_id: 'user_resolved_by_dashboard' });
      const response = yield* request.url.endsWith('/executeMeta')
        ? toolRouter.session.executeMeta(created.session_id, {
            slug: call.slug as SessionExecuteMetaParams['slug'],
            arguments: call.arguments,
          })
        : toolRouter.session.execute(created.session_id, {
            tool_slug: call.tool_slug ?? '',
            arguments: call.arguments,
            ...(account ? { account } : {}),
          });
      return dashboardProcedureResult({ ok: true, response });
    }).pipe(
      Effect.catch(error =>
        Effect.succeed(
          isAPIError(error) && error.status < 500
            ? dashboardProcedureResult({
                ok: false,
                status: error.status,
                error: error.details ?? { message: error.message },
              })
            : dashboardProcedureError({
                code: 'INTERNAL_SERVER_ERROR',
                httpStatus: 500,
                message: error instanceof Error ? error.message : `${error}`,
              })
        )
      )
    );

/**
 * The real `DashboardToolExecution` over an `HttpClient` that answers with
 * `respond`, or relays to `toolRouter` like the real Dashboard when the test
 * leaves it out, so the request the CLI builds and the reply it decodes are
 * both exercised. Needs `ComposioUserContext` for the login it sends.
 */
export const DashboardToolExecutionTest = (params: {
  readonly toolRouter: ComposioClientShape['toolRouter'];
  readonly respond?: DashboardTestResponder;
}) => {
  const relay = relayThroughToolRouter(params.toolRouter);
  const answer = (request: DashboardTestRequest) =>
    params.respond
      ? Effect.tryPromise({ try: async () => params.respond!(request), catch: cause => cause })
      : relay(request);
  return Layer.provide(
    DashboardToolExecution.Default,
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request, url) =>
        answer({
          method: request.method,
          url: url.toString(),
          headers: { ...request.headers },
          body:
            request.body._tag === 'Uint8Array'
              ? JSON.parse(new TextDecoder().decode(request.body.body))
              : undefined,
        }).pipe(
          Effect.map(response => HttpClientResponse.fromWeb(request, response)),
          Effect.mapError(
            cause =>
              new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({ request, cause }),
              })
          )
        )
      )
    )
  );
};
