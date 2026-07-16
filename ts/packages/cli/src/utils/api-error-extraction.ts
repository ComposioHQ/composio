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

import { Option, Predicate, Schema } from 'effect';

const ApiErrorDetailsSchema = Schema.Struct({
  message: Schema.optional(Schema.String),
  code: Schema.optional(Schema.Number),
  slug: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Number),
  request_id: Schema.optional(Schema.String),
  suggested_fix: Schema.optional(Schema.String),
});

export type ApiErrorDetails = typeof ApiErrorDetailsSchema.Type;

const decodeApiErrorDetails = Schema.decodeUnknownOption(ApiErrorDetailsSchema);

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

/**
 * Walk the `.error` / `.cause` chain looking for a `slug` string field.
 */
export const extractSlug = (value: unknown): string | undefined => {
  let current: unknown = value;
  const seen = new Set<unknown>();

  while (Predicate.isObject(current) && !seen.has(current)) {
    seen.add(current);

    if (Predicate.hasProperty(current, 'slug') && Predicate.isString(current.slug)) {
      return current.slug;
    }

    if (Predicate.hasProperty(current, 'error')) {
      current = current.error;
      continue;
    }

    if (Predicate.hasProperty(current, 'cause')) {
      current = current.cause;
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
  const hasApiFields = (candidate: unknown): boolean =>
    Predicate.hasProperty(candidate, 'message') ||
    Predicate.hasProperty(candidate, 'code') ||
    Predicate.hasProperty(candidate, 'slug') ||
    Predicate.hasProperty(candidate, 'status') ||
    Predicate.hasProperty(candidate, 'request_id');

  const hasStrongApiFields = (candidate: ApiErrorDetails): boolean =>
    typeof candidate.slug === 'string' || typeof candidate.request_id === 'string';

  const seen = new Set<unknown>();
  const queue: unknown[] = [value];
  let head = 0;
  let fallback: ApiErrorDetails | undefined;

  while (head < queue.length) {
    const current = queue[head++];
    if (!Predicate.isObject(current) || seen.has(current)) {
      continue;
    }
    seen.add(current);

    const candidate = Option.getOrUndefined(decodeApiErrorDetails(current));
    const isWrapper = current instanceof Error || Predicate.isTagged(current, 'UnknownException');

    if (candidate !== undefined && hasApiFields(current) && !isWrapper) {
      if (hasStrongApiFields(candidate)) {
        return candidate;
      }
      if (!fallback) {
        fallback = candidate;
      }
    }

    if (Predicate.hasProperty(current, 'error')) {
      queue.push(current.error);
    }

    if (Predicate.hasProperty(current, 'cause')) {
      queue.push(current.cause);
    }
  }

  return fallback;
};
