import { ComposioError, ComposioErrorOptions } from './ComposioError';

export const ToolRouterErrorCodes = {
  MCP_DESTINATION_REJECTED: 'MCP_DESTINATION_REJECTED',
  SESSION_CONFIG_CONFLICT: 'SESSION_CONFIG_CONFLICT',
};

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
 * configuration changed since it was last read: the `expected_config_version`
 * precondition, when explicitly requested by the caller, is
 * stale. The local session object is left as it was before the call.
 * Re-fetch the session with `sessions.use(sessionId)` and retry the update
 * against the fresh `configVersion`.
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
        'Pass `expectedConfigVersion: false` to apply the update regardless of concurrent changes (last writer wins)',
      ],
    });
    this.name = 'ComposioSessionConfigConflictError';
  }
}
