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
 * Thrown when an SDK call is cancelled via the caller-supplied `AbortSignal`.
 *
 * @example
 * ```typescript
 * try {
 *   await composio.tools.execute(slug, body, { signal: AbortSignal.timeout(5_000) });
 * } catch (err) {
 *   if (err instanceof ComposioRequestCancelledError) return;
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
 * `APIUserAbortError` has `.name === "Error"` at runtime (doesn't override it),
 * so we fall back to `constructor.name` for dual-package-hazard cases.
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
  if (
    error.constructor.name === 'APIUserAbortError' ||
    error.name === 'AbortError' ||
    error.name === 'APIUserAbortError'
  ) {
    return true;
  }
  if ('cause' in error && error.cause !== undefined && error.cause !== null) {
    return _isRequestAbortErrorAt(error.cause, depth + 1);
  }
  return false;
}
