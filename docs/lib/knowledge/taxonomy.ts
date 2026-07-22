import type { ProductArea, ProductAreaSlug } from './types';

export const PRODUCT_AREAS: readonly ProductArea[] = [
  {
    slug: 'authentication-and-connected-accounts',
    title: 'Authentication and connected accounts',
    description: 'OAuth, auth configs, scopes, credentials, and user connections.',
    defaultBrowse: true,
  },
  {
    slug: 'tools-and-actions',
    title: 'Tools and actions',
    description: 'Find, configure, and execute toolkit actions reliably.',
    defaultBrowse: true,
  },
  {
    slug: 'triggers-and-webhooks',
    title: 'Triggers and webhooks',
    description: 'Subscribe to events and handle webhook delivery.',
    defaultBrowse: true,
  },
  {
    slug: 'tool-router-mcp-and-workbench',
    title: 'Tool Router, MCP, and Workbench',
    description: 'Sessions, MCP clients, files, proxy execution, and development tools.',
    defaultBrowse: true,
  },
  {
    slug: 'sdk-and-api',
    title: 'SDK and API',
    description: 'SDK behavior, platform APIs, migrations, and reference material.',
    defaultBrowse: true,
  },
  {
    slug: 'projects-dashboard-and-billing',
    title: 'Projects, dashboard, and billing',
    description: 'Project settings, organizations, logs, plans, and billing.',
    defaultBrowse: true,
  },
  {
    slug: 'composio-for-you',
    title: 'Composio For You',
    description: 'Connect personal AI clients to apps through Composio For You.',
    defaultBrowse: false,
  },
] as const;

const PRODUCT_AREA_BY_SLUG = new Map(PRODUCT_AREAS.map((area) => [area.slug, area]));

export function isProductAreaSlug(value: string): value is ProductAreaSlug {
  return PRODUCT_AREA_BY_SLUG.has(value as ProductAreaSlug);
}

export function getProductArea(slug: ProductAreaSlug): ProductArea {
  const area = PRODUCT_AREA_BY_SLUG.get(slug);
  if (!area) throw new Error(`Unknown product area: ${slug}`);
  return area;
}
