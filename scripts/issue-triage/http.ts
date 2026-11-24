import { Duration, Effect, Option, Redacted, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';

// Reasons a call to a third-party API fails. None of them carries response text: Jev and Plain
// responses can echo the API key, issue text, or customer data.

export class MissingApiKey extends Schema.TaggedError<MissingApiKey>()('MissingApiKey', {
  variable: Schema.String,
}) {}

export class TimedOut extends Schema.TaggedError<TimedOut>()('TimedOut', {
  after: Schema.String,
}) {}

export class Unreachable extends Schema.TaggedError<Unreachable>()('Unreachable', {}) {}

export class HttpStatus extends Schema.TaggedError<HttpStatus>()('HttpStatus', {
  status: Schema.Int,
}) {}

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()('InvalidResponse', {
  status: Schema.Int,
}) {}

export type TransportFailure = MissingApiKey | TimedOut | Unreachable;

export const describeFailure = (reason: TransportFailure | HttpStatus | InvalidResponse) => {
  switch (reason._tag) {
    case 'MissingApiKey':
      return `${reason.variable} is not configured`;
    case 'TimedOut':
      return `timed out after ${reason.after}`;
    case 'Unreachable':
      return 'network request failed';
    case 'HttpStatus':
      return `HTTP ${reason.status}`;
    case 'InvalidResponse':
      return `HTTP ${reason.status}; unexpected response body`;
  }
};

/** An API key read from an optional variable; GitHub passes an unset secret as an empty string. */
export const apiKey = (variable: string, value: Option.Option<Redacted.Redacted>) =>
  Option.match(Option.filter(value, key => Redacted.value(key) !== ''), {
    onNone: () => Effect.fail(new MissingApiKey({ variable })),
    onSome: Effect.succeed,
  });

export interface JsonAnswer {
  readonly status: number;
  readonly text: string;
}

/** POSTs JSON with a bearer key, refusing redirects, and reads the whole body within `timeout`. */
export const postJson = Effect.fnUntraced(function* (
  url: string,
  key: Redacted.Redacted,
  payload: unknown,
  timeout: Duration.Input
) {
  const client = yield* HttpClient.HttpClient;
  const request = HttpClientRequest.post(url).pipe(
    HttpClientRequest.bearerToken(Redacted.value(key)),
    HttpClientRequest.bodyJsonUnsafe(payload)
  );
  return yield* Effect.gen(function* () {
    const response = yield* client.execute(request);
    return { status: response.status, text: yield* response.text } satisfies JsonAnswer;
  }).pipe(
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }),
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () => Effect.fail(new TimedOut({ after: Duration.format(Duration.fromInputUnsafe(timeout)) })),
    }),
    Effect.catchTag('HttpClientError', () => Effect.fail(new Unreachable()))
  );
});

/** Decodes a JSON body; the decode issue is dropped because it can quote the body. */
export const decodeJson = <S extends Schema.Top>(schema: S, answer: JsonAnswer) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(answer.text).pipe(
    Effect.mapError(() => new InvalidResponse({ status: answer.status }))
  ) as Effect.Effect<S['Type'], InvalidResponse, S['DecodingServices']>;
