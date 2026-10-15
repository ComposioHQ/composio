import { Effect, Schema } from 'effect';
import type { RequestOptions } from '@composio/client/effect';
import { HttpDecodingError } from './composio-errors';

// Maximum concurrent requests per each endpoint
export const MAX_CONCURRENT_REQUESTS_PER_ENDPOINT = 4;

/**
 * Request options that make the client validate the response against its own
 * schema for the operation, so a response in an unexpected shape fails the
 * call with a `DecodeError` instead of surfacing later as a missing field.
 *
 * Pass it on a read whose fields the command uses through the client's types.
 * Leave it off when the CLI decodes the response with a schema it owns, when
 * the endpoint is read leniently on purpose, and on every call that is not a
 * read: failing after the server acted would invite a retry that repeats the
 * side effect.
 */
export const validated = { decode: true } satisfies RequestOptions;

/**
 * Decodes a payload against a CLI-owned contract.
 */
export const decode =
  <S extends Schema.Top>(schema: S) =>
  (input: unknown): Effect.Effect<S['Type'], HttpDecodingError, S['DecodingServices']> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.catchTag('SchemaError', cause => new HttpDecodingError({ cause }))
    );
