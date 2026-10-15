import { Effect, Schema } from 'effect';
import type { RequestOptions } from '@composio/client/effect';
import { HttpDecodingError } from './composio-errors';

// Maximum concurrent requests per each endpoint
export const MAX_CONCURRENT_REQUESTS_PER_ENDPOINT = 4;

/**
 * The client validates a response against its own schema unless a call opts
 * out. A call opts out when the CLI decodes the response with a schema it
 * owns, when the endpoint is one the CLI reads leniently on purpose, or when
 * the call is not a read: failing after the server acted would invite a retry
 * that repeats the side effect.
 */
export const undecoded = { decode: false } satisfies RequestOptions;

/**
 * Decodes a payload against a CLI-owned contract.
 */
export const decode =
  <S extends Schema.Top>(schema: S) =>
  (input: unknown): Effect.Effect<S['Type'], HttpDecodingError, S['DecodingServices']> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.catchTag('SchemaError', cause => new HttpDecodingError({ cause }))
    );
