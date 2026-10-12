import type { ComposioRequestOptions } from '../types/requestOptions.types';

/**
 * Request options for a call that executes a tool or proxies an API call: the
 * caller's options with retries disabled.
 *
 * These calls are non-idempotent writes. The client retries timeouts,
 * connection errors, and 408/409/429/5xx responses by default, and a retry
 * after the backend already acted duplicates the side effect (e.g. sends the
 * same email twice). The backend does not deduplicate executions, so every
 * execution path must go through this helper. Reads keep the default retries.
 * See https://github.com/ComposioHQ/composio/issues/3654.
 *
 * @internal
 */
export function withoutRetries(
  requestOptions?: ComposioRequestOptions
): ComposioRequestOptions & { maxRetries: 0 } {
  return { ...requestOptions, maxRetries: 0 };
}
