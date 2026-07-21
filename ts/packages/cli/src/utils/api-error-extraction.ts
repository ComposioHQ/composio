/**
 * Utilities for extracting structured information from deeply-nested API errors.
 *
 * The Composio SDK wraps errors in multiple layers (ComposioToolExecutionError → API response → JSON body).
 * These functions traverse the `.error` / `.cause` chain to find the actual error details,
 * the error slug, and a human-readable message.
 *
 * Used by both the `ToolsExecutor` service (for error classification) and the
 * `tools execute` command (for error display).
 */

import { Predicate } from 'effect';

export interface ApiErrorDetails {
  readonly message?: string;
  readonly code?: number;
  readonly slug?: string;
  readonly status?: number;
  readonly request_id?: string;
  readonly suggested_fix?: string;
}

const pickString = (value: object, key: string): string | undefined =>
  Predicate.hasProperty(value, key) && Predicate.isString(value[key]) ? value[key] : undefined;

const pickNumber = (value: object, key: string): number | undefined =>
  Predicate.hasProperty(value, key) && Predicate.isNumber(value[key]) ? value[key] : undefined;

// Field-by-field extraction: a present-but-mistyped field (e.g. a numeric
// `message`) drops only that field, not the node's other perfectly good
// details like `slug` and `request_id`.
const extractCandidate = (value: object): ApiErrorDetails | undefined => {
  const candidate: ApiErrorDetails = {
    message: pickString(value, 'message'),
    code: pickNumber(value, 'code'),
    slug: pickString(value, 'slug'),
    status: pickNumber(value, 'status'),
    request_id: pickString(value, 'request_id'),
    suggested_fix: pickString(value, 'suggested_fix'),
  };
  const hasAnyApiField =
    candidate.message !== undefined ||
    candidate.code !== undefined ||
    candidate.slug !== undefined ||
    candidate.status !== undefined ||
    candidate.request_id !== undefined;
  return hasAnyApiField ? candidate : undefined;
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
  if (value && typeof value === 'object') {
    const visited = seen ?? new Set<unknown>();
    if (visited.has(value)) return undefined;
    visited.add(value);

    // Try .cause chain first (Effect's UnknownException → real SDK error)
    if ('cause' in value) {
      const causeMsg = extractMessage((value as { cause?: unknown }).cause, visited);
      if (causeMsg) return causeMsg;
    }

    // Try .error chain (SDK error → API response body → nested .error.message)
    if ('error' in value) {
      const inner = (value as { error?: unknown }).error;
      const innerMsg = extractMessage(inner, visited);
      if (innerMsg) return innerMsg;
    }

    // Fall back to the wrapper's own message
    if ('message' in value && typeof (value as { message?: unknown }).message === 'string') {
      return (value as { message: string }).message;
    }
  }

  if (value instanceof Error) return value.message;

  return undefined;
};

/**
 * Walk the `.error` / `.cause` chain looking for a `slug` string field.
 */
export const extractSlug = (value: unknown): string | undefined => {
  let current: unknown = value;
  const seen = new Set<unknown>();

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);

    if ('slug' in current && typeof (current as { slug?: unknown }).slug === 'string') {
      return (current as { slug: string }).slug;
    }

    if ('error' in current) {
      current = (current as { error?: unknown }).error;
      continue;
    }

    if ('cause' in current) {
      current = (current as { cause?: unknown }).cause;
      continue;
    }

    break;
  }

  return undefined;
};

/**
 * BFS through the `.error` / `.cause` chain to find a plain object with
 * API-specific fields (slug, request_id, code, status, message).
 *
 * Prefers objects with "strong" API fields (slug or request_id) over
 * objects that merely have a `message` (which any Error has).
 * Skips Error instances and Effect's UnknownException wrappers.
 */
export const extractApiErrorDetails = (value: unknown): ApiErrorDetails | undefined => {
  const hasStrongApiFields = (candidate: ApiErrorDetails): boolean =>
    typeof candidate.slug === 'string' || typeof candidate.request_id === 'string';

  const seen = new Set<unknown>();
  const queue: unknown[] = [value];
  let head = 0;
  let fallback: ApiErrorDetails | undefined;

  while (head < queue.length) {
    const current = queue[head++];
    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue;
    }
    seen.add(current);

    const candidate = extractCandidate(current);
    const isWrapper = current instanceof Error || Predicate.isTagged(current, 'UnknownException');

    if (candidate !== undefined && !isWrapper) {
      if (hasStrongApiFields(candidate)) {
        return candidate;
      }
      if (!fallback) {
        fallback = candidate;
      }
    }

    if ('error' in current) {
      queue.push((current as { error?: unknown }).error);
    }

    if ('cause' in current) {
      queue.push((current as { cause?: unknown }).cause);
    }
  }

  return fallback;
};
