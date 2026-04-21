export const DOCS_BASE_URL = 'https://docs.composio.dev';
export const API_V31_BASE_URL = 'https://backend.composio.dev/api/v3.1';
export const API_V3_BASE_URL = 'https://backend.composio.dev/api/v3';
export const API_REFERENCE_URL = `${DOCS_BASE_URL}/reference/api-reference`;
export const API_V31_SPEC_URL = `${DOCS_BASE_URL}/openapi.json`;
export const API_V3_SPEC_URL = `${DOCS_BASE_URL}/openapi-v3.json`;
export const API_HEALTH_URL = `${DOCS_BASE_URL}/api/health`;
export const AUTH_ISSUER = 'https://backend.composio.dev/api/v3/auth/dash';
export const AUTHORIZATION_SERVER_METADATA_URL =
  'https://backend.composio.dev/.well-known/oauth-authorization-server';
export const AUTHORIZATION_ENDPOINT = `${AUTH_ISSUER}/oauth2/authorize`;
export const TOKEN_ENDPOINT = `${AUTH_ISSUER}/oauth2/token`;
export const JWKS_URI = `${AUTH_ISSUER}/jwks`;
export const USERINFO_ENDPOINT = `${AUTH_ISSUER}/oauth2/userinfo`;
export const REGISTRATION_ENDPOINT = `${AUTH_ISSUER}/oauth2/register`;
export const INTROSPECTION_ENDPOINT = `${AUTH_ISSUER}/oauth2/introspect`;
export const REVOCATION_ENDPOINT = `${AUTH_ISSUER}/oauth2/revoke`;
export const END_SESSION_ENDPOINT = `${AUTH_ISSUER}/oauth2/end-session`;
export const AUTH_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const;
export const AGENT_SKILLS_SCHEMA =
  'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

export const agentSkills = [
  {
    name: 'api-discovery',
    description:
      'Discover the Composio REST API through the API catalog, OpenAPI descriptions, and API reference docs.',
  },
  {
    name: 'oauth-authentication',
    description:
      'Discover how Composio documents OAuth and OIDC authentication metadata for browser and agent clients.',
  },
  {
    name: 'mcp-setup',
    description:
      'Understand how to obtain and install a Composio MCP endpoint for a user or session-specific integration.',
  },
  {
    name: 'docs-navigation',
    description:
      'Search the Composio docs site, open reference pages, and retrieve tool schemas from the browser surface.',
  },
] as const;
