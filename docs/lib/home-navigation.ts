export interface HomeIntentLink {
  title: string;
  description: string;
  href: string;
}

export interface HomeIntent {
  id: 'build' | 'use';
  title: string;
  description: string;
  links: HomeIntentLink[];
}

/**
 * The canonical Welcome-page paths for both people and generated Markdown.
 * Keep this data free of presentation details so every surface recommends the
 * same starting point.
 */
export const HOME_INTENTS: HomeIntent[] = [
  {
    id: 'build',
    title: 'Build with Composio',
    description: 'Add tools and managed authentication to an application you are building.',
    links: [
      {
        title: 'SDK quickstart',
        description: 'Build an agent with Python or TypeScript.',
        href: '/docs/quickstart',
      },
      {
        title: 'MCP for your application',
        description: 'Create an MCP endpoint for each user session.',
        href: '/docs/sessions-via-mcp',
      },
      {
        title: 'SDKs and frameworks',
        description: 'Choose your AI SDK or agent framework.',
        href: '/docs/providers',
      },
    ],
  },
  {
    id: 'use',
    title: 'Use Composio',
    description: 'Connect Composio to an agent or workflow you already use.',
    links: [
      {
        title: 'Composio Connect',
        description: 'Connect Claude Code, Codex, Cursor, or another MCP client.',
        href: '/docs/composio-connect',
      },
      {
        title: 'Composio CLI',
        description: 'Find, connect, and run tools from your terminal.',
        href: '/docs/cli',
      },
      {
        title: 'Claude Code plugin',
        description: 'Install Composio directly in Claude Code.',
        href: '/docs/claude-code-plugin',
      },
    ],
  },
];

export function homeIntentsToMarkdown(): string {
  const sections = HOME_INTENTS.map(intent => {
    const links = intent.links
      .map(link => `- [${link.title}](${link.href}): ${link.description}`)
      .join('\n');

    return `### ${intent.title}\n\n${intent.description}\n\n${links}`;
  }).join('\n\n');

  return `## Choose how to start\n\n${sections}`;
}

export function replaceHomeNavigationMarkdown(content: string): string {
  return content.replace(/<HomeSurfaces\s*\/>/g, homeIntentsToMarkdown());
}
