import type { AuthConfigItem } from 'src/models/auth-configs';

/**
 * An enabled, Composio-managed Gmail auth config. Suites override only the
 * fields their scenario is about.
 */
export const makeAuthConfigItem = (overrides: Partial<AuthConfigItem> = {}): AuthConfigItem => ({
  id: 'ac_gmail_default',
  name: 'Gmail Default',
  no_of_connections: 5,
  status: 'ENABLED',
  type: 'default',
  uuid: 'uuid-1',
  toolkit: { logo: '', slug: 'gmail' },
  auth_scheme: 'OAUTH2',
  is_composio_managed: true,
  is_enabled_for_tool_router: true,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});
