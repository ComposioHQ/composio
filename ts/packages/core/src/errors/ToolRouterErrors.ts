import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const ToolRouterErrorCodes = {
  MCP_DESTINATION_REJECTED: 'MCP_DESTINATION_REJECTED',
  SESSION_CONFIG_CONFLICT: 'SESSION_CONFIG_CONFLICT',
  TOOL_INPUT_REQUIRED: 'TOOL_INPUT_REQUIRED',
};

/** One question a tool asks the user before it can run. */
export interface ToolRouterInputRequest {
  /** Kind of input requested. */
  type: 'elicitation';
  /** How the client collects the input. */
  mode: 'form';
  /** Message to show the user. */
  message: string;
  /** JSON Schema for the answer: a flat object with string, number, boolean or enum fields. */
  requestedSchema: Record<string, unknown>;
}

/**
 * Thrown when a session's hosted MCP endpoint is not a destination the SDK
 * will hand the session credential to. The SDK only attaches its credential
 * and scope headers when the MCP URL shares the origin of the API base URL
 * the session was created against. The error is raised only when the caller
 * asked for the endpoint with `mcp: true`; otherwise the session is returned
 * with empty `mcp.headers` and a warning is logged instead. The error names
 * both origins and never includes a credential value.
 */
export class ComposioMCPDestinationError extends ComposioError {
  constructor(
    message: string = 'The session MCP endpoint is not a trusted destination for the session credential',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: ToolRouterErrorCodes.MCP_DESTINATION_REJECTED,
      possibleFixes: options.possibleFixes ?? [
        'Point `baseURL` at the API origin that serves the session MCP endpoint; a custom base URL yields a matching MCP origin',
      ],
    });
    this.name = 'ComposioMCPDestinationError';
  }
}

/**
 * Thrown when a session update is rejected with HTTP 409 because the session
 * configuration changed since it was last read, for example when an
 * `expectedConfigVersion` precondition passed to `update()` is stale. The
 * local session object is left as it was before the call. Re-fetch the session
 * with `sessions.use(sessionId)` and retry the update against the fresh
 * `configVersion`.
 *
 * Applying a saved Session config with `experimental.sessionConfigId` can
 * also conflict when the session or the config changes while the update is
 * applied; `meta.sessionConfigId` then names the config.
 */
export class ComposioSessionConfigConflictError extends ComposioError {
  constructor(
    message: string = 'The session configuration changed since it was last read; re-fetch the session and retry the update',
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    super(message, {
      ...options,
      code: ToolRouterErrorCodes.SESSION_CONFIG_CONFLICT,
      statusCode: 409,
      possibleFixes: options.possibleFixes ?? [
        'Re-fetch the session with `composio.sessions.use(sessionId)` to observe the current configVersion, then retry the update',
        'Omit `expectedConfigVersion` to apply the update regardless of concurrent changes (last writer wins)',
      ],
    });
    this.name = 'ComposioSessionConfigConflictError';
  }
}

/**
 * Thrown when a session tool execution or proxied call did not run because it
 * needs input from the user first, for example an approval. The API answers
 * such a call with `result_type: "input_required"` instead of a result.
 *
 * `inputRequests` holds the questions, keyed by the ID the answers must
 * reuse. `requestState` is the opaque `request_state` the API returned; when
 * present it must be sent back unchanged together with the answers. The SDK
 * does not submit answers yet, so nothing was executed and the call is not
 * retried.
 */
export class ComposioToolInputRequiredError extends ComposioError {
  /** Questions for the user, keyed by the ID the answers must reuse. */
  public readonly inputRequests: Record<string, ToolRouterInputRequest>;
  /**
   * Opaque `request_state` from the API, to be sent back unchanged with the answers.
   *
   * It is continuation state, so it is kept out of logs: the property is
   * non-enumerable. Read it as `error.requestState`; `console.error(error)`,
   * `util.inspect(error)`, `JSON.stringify(error)` and object spread leave it out.
   */
  declare public readonly requestState?: string;

  constructor(
    subject: string,
    details: { inputRequests: Record<string, ToolRouterInputRequest>; requestState?: string },
    options: Omit<ComposioErrorOptions, 'code' | 'statusCode'> = {}
  ) {
    const count = Object.keys(details.inputRequests).length;
    super(
      `${subject} requires user input before it can run (${count} input request${count === 1 ? '' : 's'}) and was not executed. ` +
        'The questions are on `inputRequests` and the opaque `request_state` to send back with the answers is on `requestState`.',
      {
        ...options,
        code: ToolRouterErrorCodes.TOOL_INPUT_REQUIRED,
        possibleFixes: options.possibleFixes ?? [
          'Collect the answers described by `inputRequests`, then call the session execute endpoint again with `input_responses` and the unchanged `request_state`',
          'Remove the tool, its toolkit or its tags from the `require_approval` lists of the session configuration if no approval is intended',
        ],
      }
    );
    this.name = 'ComposioToolInputRequiredError';
    this.inputRequests = details.inputRequests;
    Object.defineProperty(this, 'requestState', {
      value: details.requestState,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }
}
