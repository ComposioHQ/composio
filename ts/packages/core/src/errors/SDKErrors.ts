import { APIUserAbortError } from '@composio/client';
import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const SDKErrorCodes = {
  NO_API_KEY_PROVIDED: 'NO_API_KEY_PROVIDED',
  API_KEY_KIND_MISMATCH: 'API_KEY_KIND_MISMATCH',
  SCOPE_CONFIG_INVALID: 'SCOPE_CONFIG_INVALID',
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
 * Thrown when the only API key the SDK could find is a Composio user key
 * (`uak_...`, as stored by `composio login`) rather than a project key.
 * User keys authenticate a person, not a project, so the SDK refuses to send
 * one as `x-api-key`. The error never includes the key value.
 */
/**
 * Thrown when the organization/project scope of an SDK instance is
 * inconsistent: only one of `orgId` / `projectId` was supplied, or a scope
 * option disagrees with the same header placed in `defaultHeaders`.
 */
export class ComposioScopeConfigError extends ComposioError {
  constructor(
    message: string = 'Invalid organization/project scope configuration',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: SDKErrorCodes.SCOPE_CONFIG_INVALID,
      possibleFixes: options.possibleFixes || [
        'Pass both `orgId` and `projectId` (the organization and consumer project nano IDs), or neither',
        'Supply the scope through the options or through the `x-org-id` / `x-project-id` default headers, not both with different values',
      ],
    });
    this.name = 'ComposioScopeConfigError';
  }
}

export class ComposioAPIKeyKindError extends ComposioError {
  constructor(
    message: string = 'The stored Composio API key is a user API key, not a project API key',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: SDKErrorCodes.API_KEY_KIND_MISMATCH,
      cause:
        options.cause ||
        'The user config file holds a user API key written by the Composio CLI; it cannot authenticate SDK requests as a project',
      possibleFixes: options.possibleFixes || [
        'Pass a project API key via `apiKey` or the COMPOSIO_API_KEY environment variable',
        'Create a project API key in the Composio dashboard at https://platform.composio.dev',
        'To authenticate with the user API key instead, pass `apiKey: null` together with `userApiKey`',
      ],
      statusCode: 401,
    });
    this.name = 'ComposioAPIKeyKindError';
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
