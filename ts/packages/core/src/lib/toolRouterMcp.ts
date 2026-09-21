import { ComposioMCPDestinationError } from '../errors/ToolRouterErrors';
import type { ComposioRequestHeaders } from '../types/composio.types';
import type { MCPServerType, ToolRouterMCPServerConfig } from '../types/toolRouter.types';
import {
  getUserApiKeyHeader,
  ORG_ID_HEADER,
  PROJECT_ID_HEADER,
  USER_API_KEY_HEADER,
} from '../utils/sdk';

const parseOrigin = (url: string, role: 'API base URL' | 'MCP URL'): URL => {
  try {
    return new URL(url);
  } catch (_error) {
    throw new ComposioMCPDestinationError(`The ${role} is not a valid absolute URL`, {
      meta: { role },
    });
  }
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
 * other destination raises {@link ComposioMCPDestinationError} naming both
 * origins. The SDK itself never connects to the MCP URL and does not follow
 * redirects for it; an MCP client consuming this config must not forward
 * these headers to a different origin.
 */
export const buildMCPServerConfig = (input: MCPServerConfigInput): ToolRouterMCPServerConfig => {
  const api = parseOrigin(input.apiBaseURL, 'API base URL');
  const mcp = parseOrigin(input.url, 'MCP URL');

  if (mcp.origin !== api.origin) {
    throw new ComposioMCPDestinationError(
      `The session MCP endpoint origin ${mcp.origin} does not match the API origin ${api.origin}; the session credential was not attached`,
      { meta: { mcpOrigin: mcp.origin, apiOrigin: api.origin } }
    );
  }

  const headers: Record<string, string> = {};
  if (typeof input.apiKey === 'string' && input.apiKey.length > 0) {
    headers['x-api-key'] = input.apiKey;
  } else if (typeof input.userApiKey === 'string' && input.userApiKey.length > 0) {
    headers[USER_API_KEY_HEADER] = input.userApiKey;
  } else {
    const userApiKeyHeader = getUserApiKeyHeader(input.defaultHeaders);
    if (userApiKeyHeader) {
      headers[USER_API_KEY_HEADER] = userApiKeyHeader.value;
    }
  }
  if (input.orgId) {
    headers[ORG_ID_HEADER] = input.orgId;
  }
  if (input.projectId) {
    headers[PROJECT_ID_HEADER] = input.projectId;
  }

  return { type: input.type, url: input.url, headers };
};
