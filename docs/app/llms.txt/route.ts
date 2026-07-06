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

interface PageMeta {
  title: string;
  description?: string;
}

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
 * `- [Title](https://…/page.md): description` — the llms.txt spec's link
 * format. Titles/descriptions come from page frontmatter, so an agent can
 * pick the right page without fetching blindly.
 */
function pageLine(url: string, meta: Map<string, PageMeta>, fallbackName?: string): string {
  const info = meta.get(url);
  const title = info?.title || fallbackName || url;
  const description = info?.description ? `: ${info.description}` : '';
  return `- [${title}](https://docs.composio.dev${url}.md)${description}`;
}

/**
 * Walk the fumadocs page tree and generate a markdown index.
 * Separators become ## headings, pages become link entries, folders recurse.
 * Legacy/deprecated pages are skipped based on frontmatter.
 */
function renderNode(
  node: TreeNode,
  legacyUrls: Set<string>,
  meta: Map<string, PageMeta>,
  depth: number,
): string[] {
  const lines: string[] = [];

  if (!nodeHasVisiblePage(node, legacyUrls)) return lines;

  if (node.type === 'page') {
    lines.push(pageLine(node.url, meta, nodeText(node.name) ?? undefined));
    return lines;
  }

  if (node.type === 'folder') {
    const text = nodeText(node.name);
    if (text) lines.push('', `${'#'.repeat(depth)} ${text}`, '');
    if (node.index && !legacyUrls.has(node.index.url)) {
      lines.push(pageLine(node.index.url, meta, nodeText(node.index.name) ?? undefined));
    }
    for (const child of node.children) {
      lines.push(...renderNode(child, legacyUrls, meta, depth + 1));
    }
  }

  return lines;
}

function walkPageTree(
  nodes: TreeNode[],
  legacyUrls: Set<string>,
  meta: Map<string, PageMeta>,
  depth = 2,
): string {
  const lines: string[] = [];
  let sectionName: ReactNode | undefined;
  let sectionNodes: TreeNode[] = [];

  function flushSection() {
    const sectionLines = sectionNodes.flatMap((node) =>
      renderNode(node, legacyUrls, meta, depth + 1),
    );
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

interface PageLike {
  url: string;
  data: { title: string; description?: string; legacy?: boolean };
}

export async function GET() {
  try {
    const allPages = [
      ...(source.getPages() as PageLike[]),
      ...(examplesSource.getPages() as PageLike[]),
      ...(referenceSource.getPages() as PageLike[]),
      ...(toolkitsSource.getPages() as PageLike[]),
    ];
    const meta = new Map<string, PageMeta>(
      allPages.map((page) => [
        page.url,
        { title: page.data.title, description: page.data.description },
      ]),
    );

    const legacyUrls = new Set(
      (source.getPages() as PageLike[])
        .filter((page) => page.data.legacy === true)
        .map((page) => page.url),
    );
    const docsTree = walkPageTree(source.pageTree.children as TreeNode[], legacyUrls, meta);

    const format = (page: PageLike) => pageLine(page.url, meta);
    const examplesPages = (examplesSource.getPages() as PageLike[]).map(format);
    const referencePages = (referenceSource.getPages() as PageLike[])
      .filter((page) => !page.url.startsWith('/reference/v3/'))
      .map(format);
    const legacyReferencePages = (referenceSource.getPages() as PageLike[])
      .filter((page) => page.url.startsWith('/reference/v3/'))
      .map(format);
    const toolkitsPages = (toolkitsSource.getPages() as PageLike[]).map(format);

    const index = `# Composio Documentation

> Composio powers 1000+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.

> **For AI agents:** Give your agent tools it can call directly with \`composio.create(user_id)\` + \`session.tools()\` and a provider package (e.g. \`composio_openai\`, \`@composio/openai\`). To connect over MCP instead, create the session with \`mcp: true\` and read \`session.mcp.url\` from any MCP-compatible client. Every page below has a \`For AI agents\` section with implementation details — read it before writing code.

> **Discovery:** append \`.md\` to any docs URL for clean markdown. Toolkit docs for 1000+ apps: \`https://docs.composio.dev/toolkits/{slug}.md\`. Search instead of scanning: \`GET https://docs.composio.dev/api/docs-search?q=<query>\`. Install the agent skill once per repo: https://docs.composio.dev/skill.md

${docsTree}

## Examples

End-to-end projects you can read top to bottom; each maps product goals to Composio primitives.

${examplesPages.join('\n')}

## API Reference

${referencePages.join('\n')}

## Toolkits

Static toolkit guides below; per-app docs (tools, triggers, auth quirks) live at \`https://docs.composio.dev/toolkits/{slug}.md\`.

${toolkitsPages.join('\n')}

## Full documentation files

- [llms-docs.txt](https://docs.composio.dev/llms-docs.txt): every core guide, full text (~90k tokens)
- [llms-examples.txt](https://docs.composio.dev/llms-examples.txt): the worked example projects, full text (~10k tokens — cheapest way to see complete builds)
- [llms-reference.txt](https://docs.composio.dev/llms-reference.txt): current API reference + toolkit guides, full text (~65k tokens)
- [llms-full.txt](https://docs.composio.dev/llms-full.txt): everything in one file (~170k tokens — prefer a slice above)

## Optional

Legacy v3.0 API reference — near-duplicate of the current reference; skip unless you maintain code pinned to v3.0.

${legacyReferencePages.join('\n')}
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
