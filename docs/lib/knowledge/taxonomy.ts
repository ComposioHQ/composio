import type { ProductArea, ProductAreaSlug } from './types';

export const PRODUCT_AREAS: readonly ProductArea[] = [
  {
    slug: 'authentication-and-connected-accounts',
    title: 'Authentication and connected accounts',
    description: 'OAuth, auth configs, credentials, scopes, and connection lifecycle.',
    defaultBrowse: true,
  },
  {
    slug: 'tools-actions-and-execution',
    title: 'Tools, actions, and execution',
    description: 'Find tools, run actions, manage sessions, and troubleshoot execution.',
    defaultBrowse: true,
  },
  {
    slug: 'triggers-and-workflows',
    title: 'Triggers and workflows',
    description: 'Configure triggers, receive events, and build reliable workflows.',
    defaultBrowse: true,
  },
  {
    slug: 'sdk-api-and-mcp',
    title: 'SDK, API, and MCP',
    description: 'Integrate Composio through SDKs, platform APIs, MCP, and developer tooling.',
    defaultBrowse: true,
  },
  {
    slug: 'account-billing-and-security',
    title: 'Account, billing, and security',
    description: 'Manage organizations, projects, billing, permissions, privacy, and security.',
    defaultBrowse: true,
  },
] as const;

const PRODUCT_AREA_REDIRECTS: Readonly<Record<string, string>> = {
  authentication: '/kb/topic/authentication-and-connected-accounts',
  'tools-and-actions': '/kb/topic/tools-actions-and-execution',
  'triggers-and-webhooks': '/kb/topic/triggers-and-workflows',
  'tool-router-mcp-and-workbench': '/kb/topic/sdk-api-and-mcp',
  'sdk-and-api': '/kb/topic/sdk-api-and-mcp',
  'projects-dashboard-and-billing': '/kb/topic/account-billing-and-security',
  'composio-for-you': '/kb/search?q=Composio+For+You',
};

const PRODUCT_AREA_BY_SLUG = new Map(PRODUCT_AREAS.map((area) => [area.slug, area]));

export function isProductAreaSlug(value: string): value is ProductAreaSlug {
  return PRODUCT_AREA_BY_SLUG.has(value as ProductAreaSlug);
}

export function getProductArea(slug: ProductAreaSlug): ProductArea {
  const area = PRODUCT_AREA_BY_SLUG.get(slug);
  if (!area) throw new Error(`Unknown product area: ${slug}`);
  return area;
}

export function getProductAreaRedirect(slug: string): string | null {
  return PRODUCT_AREA_REDIRECTS[slug] ?? null;
}
