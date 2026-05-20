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
 * `APIUserAbortError` (or a generic `AbortError`) by name. Avoids a hard
 * dependency on the concrete client class so this works across client
 * versions and through transport wrappers.
 *
 * @internal
 */
export function isRequestAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'APIUserAbortError' ||
    error.name === 'AbortError' ||
    // DOMException with name 'AbortError' (fetch in some runtimes)
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError')
  );
}
