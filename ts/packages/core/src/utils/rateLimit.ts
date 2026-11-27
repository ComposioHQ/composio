import { APIError } from '@composio/client';

/** Whether a client error is the API rejecting the request with a 429. */
export function isRateLimitResponse(error: unknown): error is APIError {
  return error instanceof APIError && error.status === 429;
}

/**
 * Seconds a 429 asks the caller to wait, from its `Retry-After` header (seconds or an HTTP date).
 * Undefined when the header is missing or unreadable.
 *
 * @internal
 */
export function getRetryAfterSeconds(error: APIError): number | undefined {
  const value = error.headers?.get('retry-after')?.trim();
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return seconds >= 0 ? seconds : undefined;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, (date - Date.now()) / 1000);
}
