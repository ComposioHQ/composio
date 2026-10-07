import { ComposioMCPDestinationError } from '../errors/ToolRouterErrors';
import type { ComposioRequestHeaders } from '../types/composio.types';
import type { MCPServerType, ToolRouterMCPServerConfig } from '../types/toolRouter.types';
import logger from '../utils/logger';
import { ORG_ID_HEADER, PROJECT_ID_HEADER, resolveCredentialHeaders } from '../utils/sdk';

type OriginRole = 'API base URL' | 'MCP URL';

type ParsedOrigin = { origin: string } | { error: ComposioMCPDestinationError };

/**
 * Returns the tuple origin (`scheme://host[:port]`) of an absolute URL.
 *
 * URLs without a tuple origin (`data:`, `file:`, `blob:` without a base, and
 * similar) serialize their origin as the opaque string `null`. Two such URLs
 * would compare equal, so they are rejected before any comparison happens.
 */
const parseOrigin = (url: string, role: OriginRole): ParsedOrigin => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (_error) {
    return {
      error: new ComposioMCPDestinationError(`The ${role} is not a valid absolute URL`, {
        meta: { role },
      }),
    };
  }
  if (parsed.origin === 'null') {
    return {
      error: new ComposioMCPDestinationError(`The ${role} has an opaque origin`, {
        meta: { role },
      }),
    };
  }
  return { origin: parsed.origin };
};

/**
 * Returns the error describing why the MCP URL must not receive the session
 * credential, or `undefined` when it shares the API origin.
 */
const destinationRejection = (
  apiBaseURL: string,
  mcpUrl: string
): ComposioMCPDestinationError | undefined => {
  const api = parseOrigin(apiBaseURL, 'API base URL');
  if ('error' in api) {
    return api.error;
  }
  const mcp = parseOrigin(mcpUrl, 'MCP URL');
  if ('error' in mcp) {
    return mcp.error;
  }
  if (mcp.origin === api.origin) {
    return undefined;
  }
  return new ComposioMCPDestinationError(
    `The session MCP endpoint origin ${mcp.origin} does not match the API origin ${api.origin}; the session credential was not attached`,
    { meta: { mcpOrigin: mcp.origin, apiOrigin: api.origin } }
  );
};

export type MCPServerConfigInput = {
  type: MCPServerType;
  /** The MCP URL returned by the API for this session. */
  url: string;
  /** The API base URL the session request was sent to. */
  apiBaseURL: string;
  /** The project API key the session request authenticated with, or `null` when disabled. */
  apiKey: string | null | undefined;
  /** The user API key the client resolved (`userApiKey` option or `COMPOSIO_USER_API_KEY`). */
  userApiKey: string | null | undefined;
  /** The default headers configured on the SDK instance; only `x-user-api-key` is consulted. */
  defaultHeaders: ComposioRequestHeaders | undefined;
  /** Organization nano ID the instance is scoped to, if any. */
  orgId: string | undefined;
  /** Project nano ID the instance is scoped to, if any. */
  projectId: string | undefined;
  /**
   * Whether the caller asked for the MCP endpoint (`mcp: true`). Decides how
   * a rejected destination is reported: as a thrown error when `true`, as a
   * warning and an empty header set otherwise.
   */
  mcpRequested: boolean;
};

/**
 * Builds the MCP server config exported on a session.
 *
 * The headers mirror the effective auth context of the session request: the
 * project key as `x-api-key` when one is configured, otherwise the resolved
 * user API key (the `userApiKey` option, then the `x-user-api-key` default
 * header) as `x-user-api-key`, plus `x-org-id` / `x-project-id` when the
 * instance carries an explicit scope. No other default header is copied and
 * the environment is never re-read.
 *
 * The headers are only attached when the MCP URL has the same origin as the
 * API base URL the session was created against, whatever scheme the caller
 * configured: that origin already receives them on every SDK request. Any
 * other destination (a different origin, an opaque origin, or a URL that does
 * not parse) never receives the credential. When the caller asked for MCP
 * (`mcpRequested`), that raises {@link ComposioMCPDestinationError} naming
 * both origins; otherwise the session is returned with empty `headers` and a
 * warning naming both origins is logged, so callers who only use the native
 * tools are not blocked by an endpoint they never consume. The SDK itself
 * never connects to the MCP URL and does not follow redirects for it; an MCP
 * client consuming this config must not forward these headers to a different
 * origin.
 */
export const buildMCPServerConfig = (input: MCPServerConfigInput): ToolRouterMCPServerConfig => {
  const rejection = destinationRejection(input.apiBaseURL, input.url);
  if (rejection) {
    if (input.mcpRequested) {
      throw rejection;
    }
    logger.warn(
      `${rejection.message}. session.mcp.headers was left empty; pass \`mcp: true\` to make this an error`
    );
    return { type: input.type, url: input.url, headers: {} };
  }

  const headers = resolveCredentialHeaders(input);
  if (input.orgId) {
    headers[ORG_ID_HEADER] = input.orgId;
  }
  if (input.projectId) {
    headers[PROJECT_ID_HEADER] = input.projectId;
  }

  return { type: input.type, url: input.url, headers };
};
