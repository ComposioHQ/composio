import { source, examplesSource, referenceSource, toolkitsSource } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  try {
    const docsPages = source.getPages();
    const examplesPages = examplesSource.getPages();
    const referencePages = referenceSource.getPages();
    const toolkitsPages = toolkitsSource.getPages();

    // Create a map for quick lookup by slug path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageMap = new Map<string, any>();
    for (const page of docsPages) {
      pageMap.set(page.slugs.join('/'), page);
    }

    // Format page as simple URL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatPage = (page: any) =>
      `- https://docs.composio.dev${page.url}.md`;

    // Get page by slug path, return empty string if not found
    const getPage = (slugPath: string) => {
      const page = pageMap.get(slugPath);
      return page ? formatPage(page) : '';
    };

    // Get all pages in a folder
    const getFolderPages = (folder: string) => {
      return docsPages
        .filter(p => p.slugs[0] === folder)
        .map(formatPage)
        .join('\n');
    };

    // Build the index following the exact sidebar structure from meta.json
    const index = `# Composio Documentation

> Composio powers 800+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.

## Get Started

${getPage('index')}
${getPage('quickstart')}

### Providers

${getFolderPages('providers')}

## Core Concepts

${getPage('users-and-sessions')}
${getPage('authentication')}
${getPage('tools-and-toolkits')}

## Getting Started

${getPage('configuring-sessions')}

### Authenticating Users

${getFolderPages('authenticating-users')}

### Toolkits

${getFolderPages('toolkits')}

## Guides

${getPage('white-labeling-authentication')}
${getPage('managing-multiple-connected-accounts')}
${getPage('using-custom-auth-configuration')}

## Features

${getPage('triggers')}
${getPage('cli')}
${getPage('single-toolkit-mcp')}

## Direct Tool Execution Guides

### Tools

${getFolderPages('tools-direct')}

### Auth Configuration

${getFolderPages('auth-configuration')}

## Resources

${getPage('debugging-info')}

### Migration Guide

${getFolderPages('migration-guide')}

### Troubleshooting

${getFolderPages('troubleshooting')}

## Examples

${examplesPages.map(formatPage).join('\n')}

## API Reference

${referencePages.map(formatPage).join('\n')}

## Toolkits

${toolkitsPages.map(formatPage).join('\n')}

## Full Documentation

- https://docs.composio.dev/llms-full.txt
`;

    return new Response(index, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error generating llms.txt:', error);
    return new Response('Error generating documentation index', { status: 500 });
  }
}
