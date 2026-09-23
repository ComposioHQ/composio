export type DocsProduct = 'for-you' | 'platform';

type ProductSidebarGroupLink =
  | { type?: 'page'; url: string; label?: string }
  | { type: 'folder'; path: string; label?: string }
  | { type: 'link'; url: string; label: string; external?: boolean };

export type ProductSidebarItem =
  | { type: 'page'; url: string; label?: string }
  | { type: 'folder'; path: string; label?: string }
  | { type: 'link'; url: string; label: string; external?: boolean }
  | { type: 'group'; label: string; links: readonly ProductSidebarGroupLink[] };

export interface ProductSidebarGroup {
  label: string;
  items: readonly ProductSidebarItem[];
}

export interface HomeIntentLink {
  title: string;
  description: string;
  href: string;
}

export interface HomeIntent {
  id: 'build' | 'use';
  productId: DocsProduct;
  product: 'Platform' | 'For You';
  title: string;
  description: string;
  links: readonly HomeIntentLink[];
}

interface DocsProductConfig {
  id: DocsProduct;
  product: HomeIntent['product'];
  switcherDescription: string;
  landingRoute: string;
  theme: 'light' | 'dark';
  themeColor: '#131211' | '#ffffff';
  routePrefixes: readonly string[];
  sidebar: readonly ProductSidebarGroup[];
  home: Omit<HomeIntent, 'productId' | 'product'>;
}

const SHARED_SIDEBAR_ITEMS = [
  { type: 'page', url: '/docs/using-composio-skill' },
  { type: 'folder', path: 'security', label: 'Security and data' },
] as const satisfies readonly ProductSidebarItem[];

const SHARED_ROUTE_PREFIXES = SHARED_SIDEBAR_ITEMS.map(item =>
  item.type === 'page' ? item.url : `/docs/${item.path}`
);

/**
 * Canonical product model for the docs shell and homepage.
 *
 * Platform is the documented first-visit default because it preserves the
 * existing SDK-first docs behavior. Audience-specific URLs take precedence,
 * followed by the persisted cookie on shared URLs.
 */
export const DEFAULT_DOCS_PRODUCT: DocsProduct = 'platform';
export const DOCS_PRODUCT_COOKIE = 'composio-docs-product';
export const DOCS_PRODUCT_HEADER = 'x-composio-docs-product';

export const DOCS_PRODUCTS = {
  'for-you': {
    id: 'for-you',
    product: 'For You',
    switcherDescription: 'Connect your apps to AI clients.',
    landingRoute: '/docs/agent-plugins',
    theme: 'light',
    themeColor: '#ffffff',
    routePrefixes: [
      '/docs/agent-plugins',
      '/docs/claude-code-plugin',
      '/docs/cli',
      '/docs/composio-connect',
    ],
    sidebar: [
      {
        label: 'Get started',
        items: [
          { type: 'page', url: '/docs/agent-plugins' },
          { type: 'page', url: '/docs/cli' },
          { type: 'page', url: '/docs/composio-connect', label: 'Connect with MCP' },
        ],
      },
      { label: 'Shared resources', items: SHARED_SIDEBAR_ITEMS },
    ],
    home: {
      id: 'use',
      title: 'Use Composio',
      description: 'Use Composio yourself with agents you already have.',
      links: [
        {
          title: 'Agent plugins',
          description: 'Install the native Composio plugin for Codex or Claude Code.',
          href: '/docs/agent-plugins',
        },
        {
          title: 'Composio CLI',
          description: 'Search, connect, and run tools from your terminal.',
          href: '/docs/cli',
        },
        {
          title: 'Connect over MCP',
          description: 'Use Composio with Cursor or another existing MCP client.',
          href: '/docs/composio-connect',
        },
      ],
    },
  },
  platform: {
    id: 'platform',
    product: 'Platform',
    switcherDescription: 'Build agents with the Composio SDK.',
    landingRoute: '/docs/quickstart',
    theme: 'dark',
    themeColor: '#131211',
    routePrefixes: [
      '/docs/agent-setup',
      '/docs/quickstart',
      '/docs/consumer-agents',
      '/docs/b2b-agents',
      '/docs/production-readiness',
      '/docs/providers',
      '/docs/how-composio-works',
      '/docs/configuring-sessions',
      '/docs/toolkits',
      '/docs/authentication',
      '/docs/triggers',
      '/docs/skills',
      '/docs/sessions-via-mcp',
      '/docs/sandbox',
      '/docs/extending-sessions',
      '/docs/setting-up-triggers',
      '/docs/poc-to-prod',
      '/docs/security/data-retention',
      '/docs/sessions-vs-direct-execution',
      '/docs/tools-direct',
      '/docs/auth-configuration',
      '/docs/migration-guide',
      '/docs/single-toolkit-mcp',
    ],
    sidebar: [
      {
        label: 'Get started',
        items: [
          { type: 'folder', path: 'agent-setup' },
          { type: 'page', url: '/docs/quickstart' },
          { type: 'folder', path: 'providers', label: 'SDKs and frameworks' },
        ],
      },
      {
        label: 'Build',
        items: [
          {
            type: 'group',
            label: 'Sessions',
            links: [
              { url: '/docs/how-composio-works', label: 'What is a Session?' },
              { url: '/docs/configuring-sessions' },
              { url: '/docs/sessions-via-mcp' },
            ],
          },
          { type: 'page', url: '/docs/toolkits' },
          {
            type: 'group',
            label: 'Authentication',
            links: [
              { url: '/docs/authentication', label: 'Authentication with Composio' },
              {
                url: '/docs/authentication/managing-multiple-connected-accounts',
                label: 'Multiple connected accounts',
              },
              { url: '/docs/authentication/controlling-scopes' },
              { url: '/docs/authentication/manually-authenticating' },
              { url: '/docs/authentication/programmatic-auth-configs' },
              { url: '/docs/authentication/importing-existing-connections' },
            ],
          },
          { type: 'page', url: '/docs/skills', label: 'Skills' },
          {
            type: 'group',
            label: 'Triggers',
            links: [{ url: '/docs/triggers' }, { type: 'folder', path: 'setting-up-triggers' }],
          },
        ],
      },
      {
        label: 'Customize',
        items: [
          { type: 'folder', path: 'extending-sessions' },
          { type: 'folder', path: 'sandbox' },
          {
            type: 'group',
            label: 'Guides & Examples',
            links: [
              { url: '/docs/consumer-agents' },
              { url: '/docs/b2b-agents' },
              { type: 'link', url: '/examples', label: 'Examples' },
            ],
          },
        ],
      },
      {
        label: 'Ship',
        items: [
          { type: 'page', url: '/docs/production-readiness' },
          { type: 'page', url: '/docs/authentication/white-labeling-authentication' },
          { type: 'folder', path: 'poc-to-prod' },
        ],
      },
      {
        label: 'Reference and Migration',
        items: [
          { type: 'link', url: '/reference', label: 'API reference' },
          {
            type: 'group',
            label: 'Migration and legacy',
            links: [
              { type: 'page', url: '/docs/sessions-vs-direct-execution' },
              { type: 'folder', path: 'migration-guide' },
              { type: 'folder', path: 'tools-direct' },
              { type: 'folder', path: 'auth-configuration' },
            ],
          },
        ],
      },
      { label: 'Shared resources', items: SHARED_SIDEBAR_ITEMS },
    ],
    home: {
      id: 'build',
      title: 'Build with Composio',
      description: 'Add Composio into your agent or app.',
      links: [
        {
          title: 'Quickstart',
          description: 'Build an agent that discovers tools and works across your apps.',
          href: '/docs/quickstart',
        },
        {
          title: 'Framework guides',
          description: 'Use OpenAI, Anthropic, Vercel AI SDK, or another framework.',
          href: '/docs/providers',
        },
        {
          title: 'Sessions via MCP',
          description: 'Expose a Composio session through a hosted MCP endpoint.',
          href: '/docs/sessions-via-mcp',
        },
      ],
    },
  },
} as const satisfies Record<DocsProduct, DocsProductConfig>;

export const DOCS_PRODUCT_ORDER = ['for-you', 'platform'] as const;
const HOME_PRODUCT_ORDER = ['platform', 'for-you'] as const;

export const HOME_INTENTS: readonly HomeIntent[] = HOME_PRODUCT_ORDER.map(productId => {
  const config = DOCS_PRODUCTS[productId];
  return { ...config.home, productId, product: config.product };
});

const PRODUCT_COUNTERPARTS = [
  { platform: '/docs/quickstart', 'for-you': '/docs/agent-plugins' },
  { platform: '/docs/sessions-via-mcp', 'for-you': '/docs/composio-connect' },
] as const;

function matchesRoute(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function parseDocsProduct(value: string | null | undefined): DocsProduct | null {
  return value === 'for-you' || value === 'platform' ? value : null;
}

export function classifyDocsProduct(pathname: string): DocsProduct | null {
  for (const productId of DOCS_PRODUCT_ORDER) {
    if (DOCS_PRODUCTS[productId].routePrefixes.some(prefix => matchesRoute(pathname, prefix))) {
      return productId;
    }
  }
  return null;
}

export function resolveDocsProduct(
  pathname: string,
  persistedProduct?: string | null
): DocsProduct {
  return (
    classifyDocsProduct(pathname) ?? parseDocsProduct(persistedProduct) ?? DEFAULT_DOCS_PRODUCT
  );
}

export function docsProductDestination(pathname: string, target: DocsProduct): string {
  const sourceProduct = target === 'platform' ? 'for-you' : 'platform';
  const counterpart = PRODUCT_COUNTERPARTS.find(pair =>
    matchesRoute(pathname, pair[sourceProduct])
  );
  if (counterpart) return counterpart[target];
  if (
    classifyDocsProduct(pathname) !== sourceProduct &&
    SHARED_ROUTE_PREFIXES.some(prefix => matchesRoute(pathname, prefix))
  )
    return pathname;
  return DOCS_PRODUCTS[target].landingRoute;
}

export function serializeDocsProductCookie(product: DocsProduct): string {
  return `${DOCS_PRODUCT_COOKIE}=${product}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function shouldAnimateDocsProductSwitch(
  supportsViewTransitions: boolean,
  prefersReducedMotion: boolean
): boolean {
  return supportsViewTransitions && !prefersReducedMotion;
}

/**
 * Slugify an intent's heading label into an anchor id. Called with
 * `intent.product`, so the ids are `#platform` / `#for-you`.
 */
export function homeIntentAnchor(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function homeIntentsToMarkdown(): string {
  const sections = HOME_INTENTS.map(intent => {
    const links = intent.links
      .map(link => `- [${link.title}](${link.href}): ${link.description}`)
      .join('\n');

    return `### ${intent.title}\n\n**${intent.product}**\n\n${intent.description}\n\n${links}`;
  }).join('\n\n');

  return `## Two ways to start\n\n${sections}`;
}

export function replaceHomeNavigationMarkdown(content: string): string {
  return content.replace(/<HomeSurfaces\s*\/>/g, homeIntentsToMarkdown());
}
