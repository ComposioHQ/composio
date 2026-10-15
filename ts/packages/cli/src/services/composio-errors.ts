import { Data } from 'effect';
import type { Cause } from 'effect';
import type { ComposioError } from '@composio/client/effect';

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

export type HttpError = ComposioError | HttpDecodingError;

/**
 * Every failure a client call can produce: the request itself, as the client's
 * own tagged error, decoding a CLI-owned contract, or obtaining a client from
 * the singleton.
 */
export type ClientError = HttpError | ComposioClientConfigurationError | NoSuchElementError;
