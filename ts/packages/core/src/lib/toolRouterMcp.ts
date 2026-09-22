import { ComposioMCPDestinationError } from '../errors/ToolRouterErrors';
import type { ComposioRequestHeaders } from '../types/composio.types';
import type { MCPServerType, ToolRouterMCPServerConfig } from '../types/toolRouter.types';
import logger from '../utils/logger';
import { getUserApiKeyHeader, USER_API_KEY_HEADER } from '../utils/sdk';

const parseOrigin = (url: string, role: 'API base URL' | 'MCP URL'): URL => {
  try {
    return new URL(url);
  } catch (_error) {
    throw new ComposioMCPDestinationError(`The ${role} is not a valid absolute URL`, {
      meta: { role },
    });
  }
};

/**
 * Checks that the MCP URL shares the origin of the API base URL. Throws
 * {@link ComposioMCPDestinationError} naming both origins otherwise; the
 * message never includes a credential value.
 */
const assertSameOrigin = (apiBaseURL: string, mcpURL: string): void => {
  const api = parseOrigin(apiBaseURL, 'API base URL');
  const mcp = parseOrigin(mcpURL, 'MCP URL');

  if (mcp.origin !== api.origin) {
    throw new ComposioMCPDestinationError(
      `The session MCP endpoint origin ${mcp.origin} does not match the API origin ${api.origin}; the session credential was not attached`,
      { meta: { mcpOrigin: mcp.origin, apiOrigin: api.origin } }
    );
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
  /** The default headers configured on the SDK instance; only `x-user-api-key` is consulted. */
  defaultHeaders: ComposioRequestHeaders | undefined;
  /**
   * Whether the caller asked for the MCP endpoint (`{ mcp: true }`). Decides
   * whether a rejected destination is an error or a warning.
   */
  mcpRequested: boolean;
};

/**
 * Builds the MCP server config exported on a session.
 *
 * The credential header mirrors the effective auth context of the session
 * request: the project key when one was used, otherwise the user API key
 * configured through `x-user-api-key`. No other default header is copied.
 *
 * The credential is only attached when the MCP URL has the same origin as the
 * API base URL the session was created against, whatever scheme the caller
 * configured: that origin already receives the credential on every SDK
 * request. For any other destination the outcome depends on whether the
 * caller asked for MCP: with `{ mcp: true }` a {@link ComposioMCPDestinationError}
 * naming both origins is thrown; otherwise the session is returned with empty
 * `mcp.headers` and a warning naming both origins is logged, so callers who
 * only use native tools are not affected. The SDK itself never connects to
 * the MCP URL and does not follow redirects for it; an MCP client consuming
 * this config must not forward these headers to a different origin.
 */
export const buildMCPServerConfig = (input: MCPServerConfigInput): ToolRouterMCPServerConfig => {
  try {
    assertSameOrigin(input.apiBaseURL, input.url);
  } catch (error) {
    if (input.mcpRequested || !(error instanceof ComposioMCPDestinationError)) {
      throw error;
    }
    logger.warn(
      `${error.message}. session.mcp.headers is empty; pass { mcp: true } to make this an error.`
    );
    return { type: input.type, url: input.url, headers: {} };
  }

  const headers: Record<string, string> = {};
  if (typeof input.apiKey === 'string' && input.apiKey.length > 0) {
    headers['x-api-key'] = input.apiKey;
  } else {
    const userApiKey = getUserApiKeyHeader(input.defaultHeaders);
    if (userApiKey) {
      headers[USER_API_KEY_HEADER] = userApiKey.value;
    }
  }

  return { type: input.type, url: input.url, headers };
};
