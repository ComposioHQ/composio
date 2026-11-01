import { Effect, Schema } from 'effect';
import type { RequestOptions } from '@composio/client/effect';
import { HttpDecodingError } from './composio-errors';

// Maximum concurrent requests per each endpoint
export const MAX_CONCURRENT_REQUESTS_PER_ENDPOINT = 4;

/**
 * The client's default number of retries, which the CLI's clients turn off.
 */
const DEFAULT_MAX_RETRIES = 2;

/**
 * Request options for a call that is safe to repeat: a read, or a call whose
 * repeat changes nothing on the server. The client retries such a call after a
 * connection failure, a timeout, or a 408, 409, 429 or 5xx response.
 *
 * Every other call is sent once. A create, an update, a delete, or an execution
 * that failed in flight may still have taken effect, and repeating it could
 * repeat its side effect.
 */
export const idempotent = { maxRetries: DEFAULT_MAX_RETRIES } satisfies RequestOptions;

/**
 * Request options that make the client validate the response against its own
 * schema for the operation, so a response in an unexpected shape fails the
 * call with a `DecodeError` instead of surfacing later as a missing field.
 *
 * Pass it on a read whose fields the command uses through the client's types.
 * Leave it off when the CLI decodes the response with a schema it owns, when
 * the endpoint is read leniently on purpose, and on every call that is not a
 * read. Combine it with {@link idempotent}: `{ ...idempotent, ...validated }`.
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
