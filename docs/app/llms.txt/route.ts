import { source, cookbooksSource, referenceSource, toolkitsSource } from '@/lib/source';
import type { ReactNode } from 'react';

export const revalidate = false;

// Fumadocs page tree node types
interface PageNode {
  type: 'page';
  name: ReactNode;
  url: string;
}

interface SeparatorNode {
  type: 'separator';
  name?: ReactNode;
}

interface FolderNode {
  type: 'folder';
  name: ReactNode;
  index?: PageNode;
  children: TreeNode[];
}

type TreeNode = PageNode | SeparatorNode | FolderNode;

/** Extract plain text from a ReactNode (handles strings, numbers, skips elements). */
function nodeText(name: ReactNode): string | null {
  if (typeof name === 'string') return name;
  if (typeof name === 'number') return String(name);
  return null;
}

/**
 * Walk the fumadocs page tree and generate a markdown index.
 * Separators become ## headings, pages become URL entries, folders recurse.
 */
function walkPageTree(nodes: TreeNode[], depth = 2): string {
  const lines: string[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case 'separator': {
        const text = nodeText(node.name);
        if (text) {
          lines.push('', `${'#'.repeat(depth)} ${text}`, '');
        }
        break;
      }

      case 'page':
        lines.push(`- https://docs.composio.dev${node.url}.md`);
        break;

      case 'folder': {
        // Folders are sub-sections within separator sections, so one level deeper
        const text = nodeText(node.name);
        if (text) {
          lines.push('', `${'#'.repeat(depth + 1)} ${text}`, '');
        }
        // If folder has an index page, include it
        if (node.index) {
          lines.push(`- https://docs.composio.dev${node.index.url}.md`);
        }
        // Recurse into children
        if (node.children.length > 0) {
          lines.push(walkPageTree(node.children, depth + 1));
        }
        break;
      }
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPage(page: any) {
  return `- https://docs.composio.dev${page.url}.md`;
}

export async function GET() {
  try {
    const docsTree = walkPageTree(source.pageTree.children as TreeNode[]);

    const cookbooksPages = cookbooksSource.getPages();
    const referencePages = referenceSource.getPages();
    const toolkitsPages = toolkitsSource.getPages();

    const index = `# Composio Documentation

> Composio powers 800+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.

> **For AI agents:** Composio supports two integration modes. **Native Tools:** use \`composio.create(user_id)\` + \`session.tools()\` with a provider package (e.g. \`composio_openai\`, \`@composio/openai\`). **MCP:** use \`composio.create(user_id)\` + \`session.mcp.url\` with any MCP-compatible client — no provider package needed. See any page's .md endpoint for full usage instructions.

${docsTree}

## Cookbooks

${cookbooksPages.map(formatPage).join('\n')}

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
