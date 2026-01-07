import {
  source,
  toolRouterSource,
  referenceSource,
  examplesSource,
} from '@/lib/source';

export const revalidate = false;

export async function GET() {
  try {
    const docsPages = source.getPages();
    const toolRouterPages = toolRouterSource.getPages();
    const referencePages = referenceSource.getPages();
    const examplesPages = examplesSource.getPages();

    const index = `# Composio Documentation

> Composio is the simplest way to connect AI agents to external tools and services. Connect 250+ tools to your AI agents with a single SDK.

## Overview

Composio provides:
- **Tools & Toolkits**: Pre-built integrations for GitHub, Slack, Gmail, and 250+ more services
- **Authentication**: Managed OAuth, API keys, and custom auth flows
- **Tool Router**: Route requests to the right tools automatically
- **MCP Support**: Model Context Protocol integration for AI assistants

## Getting Started

- [Quickstart Guide](https://composio.dev/docs/quickstart): Get started with Composio in 5 minutes
- [Capabilities Overview](https://composio.dev/docs/capabilities): Learn what Composio can do

## Documentation Sections

### Main Docs
${docsPages.map((page) => `- [${page.data.title}](https://composio.dev${page.url}): ${page.data.description || ''}`).join('\n')}

### Tool Router
${toolRouterPages.map((page) => `- [${page.data.title}](https://composio.dev${page.url}): ${page.data.description || ''}`).join('\n')}

### API & SDK Reference
${referencePages.slice(0, 20).map((page) => `- [${page.data.title}](https://composio.dev${page.url}): ${page.data.description || ''}`).join('\n')}
${referencePages.length > 20 ? `\n... and ${referencePages.length - 20} more reference pages` : ''}

### Examples
${examplesPages.map((page) => `- [${page.data.title}](https://composio.dev${page.url}): ${page.data.description || ''}`).join('\n')}

## Full Documentation

For the complete documentation content in a single file (optimized for LLMs), see: https://composio.dev/llms-full.txt

## Resources

- **GitHub**: https://github.com/composiohq/composio
- **Dashboard**: https://app.composio.dev
- **Discord**: https://discord.gg/composio
`;

    return new Response(index, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('Error generating llms.txt:', error);
    return new Response('Error generating documentation index', { status: 500 });
  }
}
