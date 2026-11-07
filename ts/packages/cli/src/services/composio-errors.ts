import { Data } from 'effect';
import type { Cause } from 'effect';
import type { ComposioError, ConfigurationError } from '@composio/client/effect';

type NoSuchElementError = Cause.NoSuchElementError;

/**
 * Error thrown when a client cannot be constructed from the current configuration.
 */
export class ComposioClientConfigurationError extends Data.TaggedError(
  'services/ComposioClientConfigurationError'
)<{
  readonly message: string;
  readonly cause: unknown;
}> {}

/**
 * Error thrown when a HTTP response doesn't match the expected response schema.
 */
export class HttpDecodingError extends Data.TaggedError('services/HttpDecodingError')<{
  readonly cause?: unknown;
}> {}

/**
 * A failure of a request made through the Effect client: a non-success status,
 * a transport failure, a timeout, or a response body that failed decoding.
 * `ConfigurationError` is the one client error that is not a request failure.
 */
export type ClientApiError = Exclude<ComposioError, ConfigurationError>;

/**
 * The tags of {@link ClientApiError}, for `Effect.catchTag`.
 */
export const CLIENT_API_ERROR_TAGS = [
  '@composio/client/BadRequestError',
  '@composio/client/AuthenticationError',
  '@composio/client/PermissionDeniedError',
  '@composio/client/NotFoundError',
  '@composio/client/ConflictError',
  '@composio/client/UnprocessableEntityError',
  '@composio/client/RateLimitError',
  '@composio/client/InternalServerError',
  '@composio/client/APIError',
  '@composio/client/APIConnectionError',
  '@composio/client/APIConnectionTimeoutError',
  '@composio/client/DecodeError',
] as const satisfies ReadonlyArray<ClientApiError['_tag']>;

export type ClientApiErrorTag = (typeof CLIENT_API_ERROR_TAGS)[number];

/**
 * Every failure a client call can produce: the request itself, as the client's
 * own tagged error, decoding a CLI-owned contract, or obtaining a client from
 * the singleton.
 */
export type ClientError =
  ComposioError | HttpDecodingError | ComposioClientConfigurationError | NoSuchElementError;
