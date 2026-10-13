/**
 * Adapters from failures to the Composio API error envelope.
 *
 * `@composio/client/effect` fails a non-success response with a tagged status
 * error whose `details` is the parsed `{ error: { message, code, slug, ... } }`
 * envelope. The CLI's own errors keep that failure in `.cause`, so the adapter
 * walks that chain to the first status error, recognized by its tag.
 *
 * Used by both the `ToolsExecutor` service (for error classification) and the
 * `tools execute` command (for error display).
 */

import {
  isAPIError,
  isComposioError,
  type APIConnectionError,
  type APIStatusError,
  type ConfigurationError,
  type DecodeError,
} from '@composio/client/effect';
import { Predicate } from 'effect';
import { CLIENT_API_ERROR_TAGS, type ClientApiError } from 'src/services/composio-errors';

export type { ClientApiError };

const clientApiErrorTags: ReadonlySet<string> = new Set(CLIENT_API_ERROR_TAGS);

export const isClientApiError = (value: unknown): value is ClientApiError =>
  isComposioError(value) && clientApiErrorTags.has(value._tag);

export const isClientConfigurationError = (value: unknown): value is ConfigurationError =>
  isComposioError(value) && Predicate.isTagged(value, '@composio/client/ConfigurationError');

export const isClientConnectionError = (value: unknown): value is APIConnectionError =>
  isComposioError(value) && Predicate.isTagged(value, '@composio/client/APIConnectionError');

export const isClientDecodeError = (value: unknown): value is DecodeError =>
  isComposioError(value) && Predicate.isTagged(value, '@composio/client/DecodeError');

/**
 * What the CLI prints when a response failed client decoding. It names the
 * request and never quotes the response.
 */
export const describeDecodeError = (
  error: DecodeError
): { readonly message: string; readonly hint: string } => {
  const subject =
    error.operation !== undefined ? `'${error.operation}'` : `${error.method} ${error.url}`;
  const requestId = error.requestId !== undefined ? ` (request id: ${error.requestId})` : '';
  return {
    message: `The API response for ${subject} is not in the shape this version of the CLI expects${requestId}.`,
    hint: 'Upgrade the CLI, then retry:\n> composio upgrade',
  };
};

export interface ApiErrorDetails {
  readonly message?: string;
  readonly code?: number;
  readonly slug?: string;
  readonly status?: number;
  readonly request_id?: string;
  readonly suggested_fix?: string;
}

/**
 * Returns the first client status error along the `.cause` chain, starting at
 * `value`.
 */
export const findApiError = (value: unknown): APIStatusError | undefined => {
  const seen = new Set<unknown>();
  let current: unknown = value;

  while (Predicate.isObject(current) && !seen.has(current)) {
    if (isAPIError(current)) return current;
    seen.add(current);
    current = Predicate.hasProperty(current, 'cause') ? current.cause : undefined;
  }

  return undefined;
};

/**
 * The API error envelope carried by the first status error in the cause chain,
 * with the HTTP status and request id. A body that is not the envelope keeps
 * the status and falls back to the error's own message.
 */
export const extractApiErrorDetails = (value: unknown): ApiErrorDetails | undefined => {
  const apiError = findApiError(value);
  if (!apiError) return undefined;

  const details = apiError.details;
  return {
    message: details?.message ?? apiError.message,
    code: details?.code,
    slug: details?.slug,
    status: apiError.status,
    request_id: apiError.requestId ?? details?.request_id,
    suggested_fix: details?.suggested_fix,
  };
};

/**
 * Extract a human-readable message from an unknown error value.
 * Checks `.message`, then `.error` (string or `.error.message`).
 */
export const extractMessage = (value: unknown, seen?: Set<unknown>): string | undefined => {
  if (typeof value === 'string') return value;

  // Walk the .cause / .error chain to find the deepest meaningful message.
  // A wrapper stores the failure it wraps in .cause; an API response body
  // stores its envelope in .error (which itself has .error.message).
  // We prefer the deepest message because outer wrappers often have generic
  // messages like "An unknown error occurred in Effect.tryPromise".
  if (Predicate.isObject(value)) {
    const visited = seen ?? new Set<unknown>();
    if (visited.has(value)) return undefined;
    visited.add(value);

    // A client status error keeps the response body in .body.
    if (isAPIError(value)) {
      return value.details?.message ?? extractMessage(value.body, visited) ?? value.message;
    }

    // A response that failed client decoding is reported by operation and
    // request id, with the remedy, never by the client's raw message.
    if (isClientDecodeError(value)) {
      const { message, hint } = describeDecodeError(value);
      return `${message}\n${hint}`;
    }

    // A response that failed client decoding is reported by operation and
    // request id, with the remedy, never by the client's raw message.
    if (isClientDecodeError(value)) {
      const { message, hint } = describeDecodeError(value);
      return `${message}\n${hint}`;
    }

    // A client connection error has no cause chain; the transport text is in .description.
    if (isClientConnectionError(value)) {
      return value.description ?? value.message;
    }

    // Try .cause chain first (wrapper → the failure it wraps)
    if (Predicate.hasProperty(value, 'cause')) {
      const causeMsg = extractMessage(value.cause, visited);
      if (causeMsg) return causeMsg;
    }

    // Try .error chain (API response body → nested .error.message)
    if (Predicate.hasProperty(value, 'error')) {
      const inner = value.error;
      const innerMsg = extractMessage(inner, visited);
      if (innerMsg) return innerMsg;
    }

    // Fall back to the wrapper's own message
    if (Predicate.hasProperty(value, 'message') && Predicate.isString(value.message)) {
      return value.message;
    }
  }

  if (value instanceof Error) return value.message;

  return undefined;
};
