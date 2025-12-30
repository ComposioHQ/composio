import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  const pages = source.getPages();

  const index = `# Composio Documentation

> Composio is the simplest way to connect AI agents to external tools and services.

## Docs

${pages.map((page) => `- [${page.data.title}](https://composio.dev${page.url}): ${page.data.description || ''}`).join('\n')}

## Full Documentation

For the complete documentation in a single file, see: https://composio.dev/llms-full.txt
`;

  return new Response(index, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
