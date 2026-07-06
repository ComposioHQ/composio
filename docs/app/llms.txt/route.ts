import { source, examplesSource, referenceSource, toolkitsSource } from '@/lib/source';
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

function nodeHasVisiblePage(node: TreeNode, legacyUrls: Set<string>): boolean {
  if (node.type === 'separator') return false;
  if (node.type === 'page') return !legacyUrls.has(node.url);

  return (
    (node.index !== undefined && !legacyUrls.has(node.index.url)) ||
    node.children.some((child) => nodeHasVisiblePage(child, legacyUrls))
  );
}

/**
 * Walk the fumadocs page tree and generate a markdown index.
 * Separators become ## headings, pages become URL entries, folders recurse.
 * Legacy/deprecated pages are skipped based on frontmatter.
 */
function renderNode(node: TreeNode, legacyUrls: Set<string>, depth: number): string[] {
  const lines: string[] = [];

  if (!nodeHasVisiblePage(node, legacyUrls)) return lines;

  if (node.type === 'page') {
    lines.push(`- https://docs.composio.dev${node.url}.md`);
    return lines;
  }

  if (node.type === 'folder') {
    const text = nodeText(node.name);
    if (text) lines.push('', `${'#'.repeat(depth)} ${text}`, '');
    if (node.index && !legacyUrls.has(node.index.url)) {
      lines.push(`- https://docs.composio.dev${node.index.url}.md`);
    }
    for (const child of node.children) {
      lines.push(...renderNode(child, legacyUrls, depth + 1));
    }
  }

  return lines;
}

function walkPageTree(nodes: TreeNode[], legacyUrls: Set<string>, depth = 2): string {
  const lines: string[] = [];
  let sectionName: ReactNode | undefined;
  let sectionNodes: TreeNode[] = [];

  function flushSection() {
    const sectionLines = sectionNodes.flatMap((node) => renderNode(node, legacyUrls, depth + 1));
    const text = nodeText(sectionName);

    if (sectionLines.length > 0) {
      if (text) lines.push('', `${'#'.repeat(depth)} ${text}`, '');
      lines.push(...sectionLines);
    }

    sectionName = undefined;
    sectionNodes = [];
  }

  for (const node of nodes) {
    if (node.type === 'separator') {
      flushSection();
      sectionName = node.name;
      continue;
    }

    sectionNodes.push(node);
  }

  flushSection();

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPage(page: any) {
  return `- https://docs.composio.dev${page.url}.md`;
}

export async function GET() {
  try {
    const legacyUrls = new Set(
      source.getPages()
        .filter((page) => (page.data as { legacy?: boolean }).legacy === true)
        .map((page) => page.url),
    );
    const docsTree = walkPageTree(source.pageTree.children as TreeNode[], legacyUrls);

    const examplesPages = examplesSource.getPages();
    const referencePages = referenceSource.getPages();
    const toolkitsPages = toolkitsSource.getPages();

    const index = `# Composio Documentation

> Composio powers 1000+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.

> **For AI agents:** Give your agent tools it can call directly with \`composio.create(user_id)\` + \`session.tools()\` and a provider package (e.g. \`composio_openai\`, \`@composio/openai\`). To connect over MCP instead, create the session with \`mcp: true\` and read \`session.mcp.url\` from any MCP-compatible client. See any page's .md endpoint for full usage instructions.

${docsTree}

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
