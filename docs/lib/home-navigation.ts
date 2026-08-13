export interface HomeIntentLink {
  title: string;
  description: string;
  href: string;
  /** Set for links that leave the docs site, so the card opens a new tab. */
  external?: boolean;
}

export interface HomeIntent {
  id: 'build' | 'use';
  audience: 'For you' | 'Platform';
  title: string;
  description: string;
  links: HomeIntentLink[];
}

export const HOME_INTENTS: HomeIntent[] = [
  {
    id: 'build',
    audience: 'Platform',
    title: 'Build with Composio',
    description: 'Add Composio tools and authentication to your own agent or application.',
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
  {
    id: 'use',
    audience: 'For you',
    title: 'Composio For You',
    description:
      'Connect the apps you already use to Claude, Codex, and your terminal. No SDK, no code.',
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
        title: 'Composio MCP',
        description: 'Search, connect and run tools via MCP.',
        href: 'https://composio.dev/for-you',
        external: true,
      },
    ],
  },
];

export function homeIntentAnchor(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function homeIntentsToMarkdown(): string {
  const sections = HOME_INTENTS.map(intent => {
    const links = intent.links
      .map(link => `- [${link.title}](${link.href}): ${link.description}`)
      .join('\n');

    return `### ${intent.title}\n\n**${intent.audience}**\n\n${intent.description}\n\n${links}`;
  }).join('\n\n');

  return `## Two ways to start\n\n${sections}`;
}

export function replaceHomeNavigationMarkdown(content: string): string {
  return content.replace(/<HomeSurfaces\s*\/>/g, homeIntentsToMarkdown());
}
