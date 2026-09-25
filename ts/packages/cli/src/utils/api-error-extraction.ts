/**
 * Adapters from failures to the Composio API error envelope.
 *
 * `@composio/client` rejects with an `APIError` whose `details` is the parsed
 * `{ error: { message, code, slug, ... } }` envelope. Effect wrappers keep the
 * original rejection in `.cause`, so the adapter walks that chain to the first
 * `APIError`.
 *
 * Used by both the `ToolsExecutor` service (for error classification) and the
 * `tools execute` command (for error display).
 */

import { APIError } from '@composio/client';
import { Predicate } from 'effect';

export interface ApiErrorDetails {
  readonly message?: string;
  readonly code?: number;
  readonly slug?: string;
  readonly status?: number;
  readonly request_id?: string;
  readonly suggested_fix?: string;
}

/**
 * Returns the first `APIError` along the `.cause` chain, starting at `value`.
 */
export const findApiError = (value: unknown): APIError | undefined => {
  const seen = new Set<unknown>();
  let current: unknown = value;

  while (Predicate.isObject(current) && !seen.has(current)) {
    if (current instanceof APIError) return current;
    seen.add(current);
    current = Predicate.hasProperty(current, 'cause') ? current.cause : undefined;
  }

  return undefined;
};

/**
 * The API error envelope carried by the first `APIError` in the cause chain,
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
  // Effect's UnknownException stores the real error in .cause; the Composio SDK
  // stores the API response body in .error (which itself has .error.message).
  // We prefer the deepest message because outer wrappers often have generic
  // messages like "An unknown error occurred in Effect.tryPromise".
  if (Predicate.isObject(value)) {
    const visited = seen ?? new Set<unknown>();
    if (visited.has(value)) return undefined;
    visited.add(value);

    // Try .cause chain first (Effect's UnknownException → real SDK error)
    if (Predicate.hasProperty(value, 'cause')) {
      const causeMsg = extractMessage(value.cause, visited);
      if (causeMsg) return causeMsg;
    }

    // Try .error chain (SDK error → API response body → nested .error.message)
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
