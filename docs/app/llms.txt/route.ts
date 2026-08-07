import { source, examplesSource, referenceSource, toolkitsSource } from '@/lib/source';
import { detectReferenceApiVersion } from '@/lib/api-version';
import {
  collectDefaultLlmExcludedUrls,
  collectSidebarHiddenLlmUrls,
} from '@/lib/llm-page-policy';
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
 * Separators become headings, pages become URL entries, and folders become
 * nested list groups so following root pages do not inherit a folder heading.
 * Pages excluded by the explicit LLM policy are skipped.
 */
function walkPageTree(
  nodes: TreeNode[],
  excludedUrls: ReadonlySet<string>,
  depth = 2
): string {
  const lines: string[] = [];

  for (const node of nodes) {
    if (node.type === 'separator') {
      const text = nodeText(node.name);
      if (text) {
        lines.push('', `${'#'.repeat(depth)} ${text}`, '');
      }
      continue;
    }

    switch (node.type) {
      case 'page':
        if (!excludedUrls.has(node.url)) {
          lines.push(`- https://docs.composio.dev${node.url}.md`);
        }
        break;

      case 'folder': {
        const folderLines: string[] = [];
        if (node.index && !excludedUrls.has(node.index.url)) {
          folderLines.push(`- https://docs.composio.dev${node.index.url}.md`);
        }
        if (node.children.length > 0) {
          const children = walkPageTree(node.children, excludedUrls, depth + 1);
          if (children) folderLines.push(children);
        }

        if (folderLines.length === 0) break;

        const text = nodeText(node.name);
        if (text) {
          lines.push(`- **${text}**`);
          lines.push(
            ...folderLines.flatMap(line =>
              line
                .split('\n')
                .map(folderLine => (folderLine ? `  ${folderLine}` : folderLine))
            )
          );
        } else {
          lines.push(...folderLines);
        }
        break;
      }
    }
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatPage(page: { url: string }) {
  return `- https://docs.composio.dev${page.url}.md`;
}

/**
 * Splits reference pages by REST version.
 *
 * This list is built with a flat `.map(formatPage)` that bypasses the
 * `isLegacySeparator` filter the guides tree gets, so the two trees used to
 * arrive interleaved under one unlabelled heading — and `/reference/v3/` is
 * the only version-shaped path in the corpus, so it is the highest-precision
 * match for the query most readers intend as "current Composio".
 *
 * Partitioned with `detectApiVersion`, not a literal path test, so moving the
 * legacy tree's URL stays a one-line change in `lib/api-version.ts`.
 */
function partitionByApiVersion<T extends { url: string }>(pages: T[]) {
  const current: T[] = [];
  const legacy: T[] = [];
  const versionIndependent: T[] = [];
  for (const page of pages) {
    const version = detectReferenceApiVersion(page.url);
    if (version === '3.0') legacy.push(page);
    else if (version === '3.1') current.push(page);
    else versionIndependent.push(page);
  }
  return { current, legacy, versionIndependent };
}

export async function GET() {
  try {
    const docsPages = source.getPages();
    const excludedUrls = collectDefaultLlmExcludedUrls(docsPages);
    const docsTree = walkPageTree(source.pageTree.children as TreeNode[], excludedUrls);
    const detailedGuides = collectSidebarHiddenLlmUrls(docsPages)
      .map(url => formatPage({ url }))
      .join('\n');

    const examplesPages = examplesSource.getPages();
    const toolkitsPages = toolkitsSource.getPages();
    const {
      current: currentReferencePages,
      legacy: legacyReferencePages,
      versionIndependent: versionIndependentReferencePages,
    } = partitionByApiVersion(referenceSource.getPages());

    const legacyReferenceSection =
      legacyReferencePages.length > 0
        ? `
## API Reference (v3.0, legacy — supported, not for new code)

${legacyReferencePages.map(formatPage).join('\n')}
`
        : '';

    const index = `# Composio Documentation

> Composio powers 1000+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.

> **For AI agents:** Give your agent tools it can call directly with \`composio.create(user_id)\` + \`session.tools()\` and a provider package (e.g. \`composio_openai\`, \`@composio/openai\`). To connect over MCP instead, create the session with \`mcp: true\` and read \`session.mcp.url\` from any MCP-compatible client. See any page's .md endpoint for full usage instructions.

${docsTree}

## Detailed guides

${detailedGuides}

## Examples

${examplesPages.map(formatPage).join('\n')}

## API Reference (v3.1, current)

${currentReferencePages.map(formatPage).join('\n')}
${legacyReferenceSection}
## SDK and product reference (version-independent)

${versionIndependentReferencePages.map(formatPage).join('\n')}

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
