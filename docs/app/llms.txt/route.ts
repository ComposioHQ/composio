import { source, examplesSource } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  try {
    const docsPages = source.getPages();
    const examplesPages = examplesSource.getPages();

    // Group docs pages by directory
    const groupedDocs = new Map<string, typeof docsPages>();

    for (const page of docsPages) {
      const slugs = page.slugs;
      // Get category from first slug if nested, otherwise 'core'
      const category = slugs.length > 1 ? slugs[0] : 'core';
      if (!groupedDocs.has(category)) {
        groupedDocs.set(category, []);
      }
      groupedDocs.get(category)!.push(page);
    }

    // Format page as simple URL (like Cursor's llms.txt)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatPage = (page: any) =>
      `- https://composio.dev${page.url}.md`;

    // Build sections
    const coreDocs = groupedDocs.get('core') || [];
    const providerDocs = groupedDocs.get('providers') || [];
    const modifierDocs = groupedDocs.get('modify-tool-behavior') || [];
    const troubleshootingDocs = groupedDocs.get('troubleshooting') || [];
    const migrationDocs = groupedDocs.get('migration-guide') || [];
    const nativeToolsDocs = groupedDocs.get('native-tools') || [];
    const mcpDocs = groupedDocs.get('mcp') || [];
    const featuresDocs = groupedDocs.get('features') || [];

    const index = `# Composio Documentation

> Composio is the simplest way to connect AI agents to external tools and services. Build AI agents with 800+ tools across GitHub, Slack, Gmail, and more.

## Getting Started

${coreDocs.filter(p => ['quickstart', 'index', 'authenticating-tools', 'executing-tools', 'fetching-tools'].some(s => p.slugs.includes(s))).map(formatPage).join('\n')}

## Authentication & Users

${coreDocs.filter(p => ['connected-accounts', 'user-management', 'custom-auth-configs', 'programmatic-auth-configs', 'custom-auth-params'].some(s => p.slugs.includes(s))).map(formatPage).join('\n')}

## Tools & Execution

${coreDocs.filter(p => ['custom-tools', 'toolkit-versioning', 'capabilities'].some(s => p.slugs.includes(s))).map(formatPage).join('\n')}
${nativeToolsDocs.length > 0 ? nativeToolsDocs.map(formatPage).join('\n') : ''}

## MCP (Model Context Protocol)

${mcpDocs.map(formatPage).join('\n')}

## Triggers

${coreDocs.filter(p => ['triggers'].some(s => p.slugs.includes(s))).map(formatPage).join('\n')}

## Modify Tool Behavior

${modifierDocs.map(formatPage).join('\n')}

## Providers

${providerDocs.map(formatPage).join('\n')}

## Troubleshooting

${troubleshootingDocs.map(formatPage).join('\n')}
${coreDocs.filter(p => ['cli', 'debugging-info'].some(s => p.slugs.includes(s))).map(formatPage).join('\n')}

## Migration Guides

${migrationDocs.map(formatPage).join('\n')}

## Examples

${examplesPages.map(formatPage).join('\n')}

## Full Documentation

- https://composio.dev/llms-full.txt
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
