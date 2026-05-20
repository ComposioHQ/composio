import { APIUserAbortError } from '@composio/client';
import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const SDKErrorCodes = {
  NO_API_KEY_PROVIDED: 'NO_API_KEY_PROVIDED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
};

export class ComposioNoAPIKeyError extends ComposioError {
  constructor(
    message: string = 'No Composio API key provided',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    const defaultCause =
      "Couldn't find an API key in the params, environment variables or in the user config file";

    super(message, {
      ...options,
      code: SDKErrorCodes.NO_API_KEY_PROVIDED,
      cause: options.cause || defaultCause,
      possibleFixes: options.possibleFixes || [
        'Ensure you have an API key passed in the params, or in environment variable (COMPOSIO_API_KEY) or in the user config file',
        'To get an API key, please sign up at https://composio.dev/signup',
        'You can also use the Composio CLI to create a project and get an API key',
      ],
      statusCode: 401,
    });
    this.name = 'ComposioNoAPIKeyError';
  }
}

/**
 * Thrown when an SDK call is cancelled via the caller-supplied `AbortSignal`
 * in `ComposioRequestOptions`. Use `instanceof ComposioRequestCancelledError`
 * to distinguish caller-initiated cancellation from other transport failures,
 * without having to unwrap nested causes from domain errors.
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 * try {
 *   await composio.tools.execute(slug, body, undefined, { signal: controller.signal });
 * } catch (err) {
 *   if (err instanceof ComposioRequestCancelledError) {
 *     // caller aborted — clean up and exit
 *     return;
 *   }
 *   throw err;
 * }
 * ```
 */
export class ComposioRequestCancelledError extends ComposioError {
  constructor(
    message: string = 'Request was cancelled by the caller',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: SDKErrorCodes.REQUEST_CANCELLED,
      possibleFixes: options.possibleFixes ?? [
        'This error is expected when you abort the request via AbortController. Handle it in your catch block to distinguish caller-initiated cancellation from other failures.',
      ],
    });
    this.name = 'ComposioRequestCancelledError';
  }
}

/**
 * Type guard that detects an aborted request from `@composio/client`'s
 * `APIUserAbortError`, the underlying fetch `AbortError`, or a generic
 * `AbortError` propagated through a transport wrapper.
 *
 * IMPORTANT: `APIUserAbortError` instances do NOT set `this.name`, so the
 * inherited `.name` is `"Error"` at runtime — a name-only check misses
 * them. We use `instanceof` (against the imported class) as the primary
 * signal, plus `constructor.name` as a defensive fallback for dual-package
 * hazard or multiple-client-version situations. DOMException is detected
 * separately because it doesn't extend Error in some runtimes.
 *
 * Also walks `error.cause` (up to 5 levels) so an abort wrapped in an
 * outer transport-level error — e.g. an `APIError` carrying the abort
 * as its cause from a future client refactor or a third-party retry
 * wrapper — is still detected. Today's `@composio/client` throws
 * `APIUserAbortError` directly without wrapping, but the cause walk
 * costs nothing and future-proofs the detection.
 *
 * @internal
 */
export function isRequestAbortError(error: unknown): boolean {
  return _isRequestAbortErrorAt(error, /* depth= */ 0);
}

function _isRequestAbortErrorAt(error: unknown, depth: number): boolean {
  if (depth > 5) return false;
  if (error instanceof APIUserAbortError) return true;
  if (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'AbortError'
  ) {
    return true;
  }
  if (!(error instanceof Error)) return false;
  // Defensive fallbacks: matches across-package class duplication (where
  // `instanceof APIUserAbortError` could fail) and any other transport that
  // surfaces a generic AbortError.
  if (
    error.constructor.name === 'APIUserAbortError' ||
    error.name === 'AbortError' ||
    error.name === 'APIUserAbortError'
  ) {
    return true;
  }
  // Walk the cause chain. Some wrappers (e.g. future `APIError`-wrapping
  // retry logic) carry the original abort as `error.cause`; without this
  // walk, name-only inspection of the outer error would miss it.
  if ('cause' in error && error.cause !== undefined && error.cause !== null) {
    return _isRequestAbortErrorAt(error.cause, depth + 1);
  }
  return false;
}
