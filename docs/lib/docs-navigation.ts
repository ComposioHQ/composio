export type DocsNavId = 'start' | 'build' | 'learn' | 'ship' | 'reference' | 'resources';

export interface DocsNavLink {
  text: string;
  url: string;
  external?: boolean;
}

export type DocsNavSection = { id: DocsNavId; text: string } & (
  | { type: 'link'; url: string }
  | { type: 'menu'; links: readonly DocsNavLink[]; footerLinks?: readonly DocsNavLink[] }
);

export const PLAYGROUND_URL =
  'https://dashboard.composio.dev/~/project/playground?utm_source=docs&utm_medium=navbar&utm_campaign=playground';

export const DOCS_NAVIGATION: readonly DocsNavSection[] = [
  { id: 'start', type: 'link', text: 'Get Started', url: '/docs' },
  { id: 'build', type: 'link', text: 'Build', url: '/docs/quickstart' },
  {
    id: 'learn',
    type: 'menu',
    text: 'Learn',
    links: [
      { text: 'Tools & toolkits', url: '/docs/toolkits' },
      { text: 'Authentication', url: '/docs/authentication' },
      { text: 'Sessions', url: '/docs/sessions' },
      { text: 'Triggers', url: '/docs/triggers' },
      { text: 'Instant', url: '/docs/instant-tools' },
      { text: 'Governance', url: '/docs/governance/action-permissions' },
    ],
    footerLinks: [{ text: 'Browse toolkit catalog', url: '/toolkits' }],
  },
  { id: 'ship', type: 'link', text: 'Ship & Scale', url: '/docs/production-readiness' },
  {
    id: 'reference',
    type: 'menu',
    text: 'Reference',
    links: [
      { text: 'API reference (v3.1)', url: '/reference' },
      { text: 'TypeScript SDK', url: '/reference/sdk-reference/typescript/composio' },
      { text: 'Python SDK', url: '/reference/sdk-reference/python/composio' },
      { text: 'API reference (v3)', url: '/reference/v3' },
      { text: 'Migration and legacy', url: '/docs/migration-guide' },
    ],
  },
  {
    id: 'resources',
    type: 'menu',
    text: 'Resources',
    links: [
      { text: 'Examples', url: '/examples' },
      { text: 'Changelog', url: '/docs/changelog' },
      { text: 'Knowledge Base', url: '/kb' },
    ],
    footerLinks: [
      { text: 'GitHub', url: 'https://github.com/composiohq/composio', external: true },
      { text: 'X', url: 'https://x.com/composiodevs', external: true },
      { text: 'Playground', url: PLAYGROUND_URL, external: true },
    ],
  },
];

function within(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** More specific guide routes take precedence over their parent capability. */
export function activeDocsSection(pathname: string): DocsNavId {
  if (['/examples', '/kb', '/docs/changelog'].some(prefix => within(pathname, prefix)))
    return 'resources';
  if (
    [
      '/docs/production-readiness',
      '/docs/security',
      '/docs/deployment',
      '/docs/poc-to-prod',
      '/docs/authentication/white-labeling-authentication',
      '/docs/authentication/custom-app-vs-managed-app',
    ].some(prefix => within(pathname, prefix))
  )
    return 'ship';
  if (
    [
      '/reference',
      '/docs/migration-guide',
      '/docs/tools-direct',
      '/docs/auth-configuration',
      '/docs/sessions-vs-direct-execution',
    ].some(prefix => within(pathname, prefix))
  )
    return 'reference';
  if (within(pathname, '/docs/quickstart')) return 'build';
  if (
    pathname === '/' ||
    pathname === '/docs' ||
    [
      '/docs/agent-setup',
      '/docs/providers',
      '/docs/agent-plugins',
      '/docs/cli',
      '/docs/composio-connect',
      '/docs/claude-code-plugin',
      '/docs/using-composio-skill',
    ].some(prefix => within(pathname, prefix))
  )
    return 'start';
  return 'learn';
}
