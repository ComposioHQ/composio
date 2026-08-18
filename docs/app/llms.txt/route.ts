import {
  source,
  examplesSource,
  referenceSource,
  toolkitsSource,
  knowledgeBaseSource,
} from '@/lib/source';
import { detectReferenceApiVersion } from '@/lib/api-version';
import {
  formatKnowledgeDiscoveryLinks,
  getLocalKnowledgeDiscoveryPaths,
} from '@/lib/knowledge/discovery';
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
 * A section is legacy/deprecated when its separator heading says so (e.g.
 * "Direct Tool Execution Guides (Legacy)"). We omit those sections from the
 * default LLM index so code generators reach for the current session-based
 * APIs, not deprecated ones.
 */
function isLegacySeparator(name: ReactNode): boolean {
  const text = nodeText(name);
  return text != null && /legacy|deprecated/i.test(text);
}

/**
 * Walk the fumadocs page tree and generate a markdown index.
 * Separators become ## headings, pages become URL entries, folders recurse.
 * Legacy/deprecated sections (and everything under them) are skipped.
 *
 * A folder emits a heading one level deeper, and markdown headings do not
 * close — so a plain page emitted after a folder reads as belonging to that
 * folder. `meta.json` order is the human sidebar's order and cannot absorb
 * this, so each section's direct pages are buffered and flushed ahead of its
 * folders. Within pages, and within folders, `meta.json` order is preserved.
 */
function walkPageTree(nodes: TreeNode[], depth = 2): string {
  const lines: string[] = [];
  let skippingSection = false;
  let sectionPages: string[] = [];
  let sectionFolders: string[] = [];

  function flushSection() {
    lines.push(...sectionPages, ...sectionFolders);
    sectionPages = [];
    sectionFolders = [];
  }

  for (const node of nodes) {
    if (node.type === 'separator') {
      // A separator starts a new section; skip it and its pages when legacy.
      flushSection();
      skippingSection = isLegacySeparator(node.name);
      if (skippingSection) continue;
      const text = nodeText(node.name);
      if (text) {
        lines.push('', `${'#'.repeat(depth)} ${text}`, '');
      }
      continue;
    }

    if (skippingSection) continue;

    switch (node.type) {
      case 'page':
        sectionPages.push(`- https://docs.composio.dev${node.url}.md`);
        break;

      case 'folder': {
        // Folders are sub-sections within separator sections, so one level deeper
        const text = nodeText(node.name);
        if (text) {
          sectionFolders.push('', `${'#'.repeat(depth + 1)} ${text}`, '');
        }
        // If folder has an index page, include it
        if (node.index) {
          sectionFolders.push(`- https://docs.composio.dev${node.index.url}.md`);
        }
        // Recurse into children
        if (node.children.length > 0) {
          sectionFolders.push(walkPageTree(node.children, depth + 1));
        }
        break;
      }
    }
  }

  flushSection();

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
    const docsTree = walkPageTree(source.pageTree.children as TreeNode[]);

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
    const knowledgeBasePages = knowledgeBaseSource.getPages();
    const knowledgeDiscoveryLinks = formatKnowledgeDiscoveryLinks(
      (await getLocalKnowledgeDiscoveryPaths()).filter(
        (path) => !path.startsWith('/kb/guide/'),
      ),
    );

    const index = `# Composio Documentation

> Composio powers 1000+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.

> **For AI agents:** Route by intent. To build an application, start with [Quickstart](https://docs.composio.dev/docs/quickstart.md) or [Providers](https://docs.composio.dev/docs/providers.md) and use \`composio.create(user_id)\` + \`session.tools()\`. To use Composio from Codex or Claude Code without explicit MCP intent, install the [native agent plugin](https://docs.composio.dev/docs/agent-plugins.md). To connect an existing client over MCP, use [Composio Connect](https://docs.composio.dev/docs/composio-connect.md). When an application creates a session and needs MCP transport, use [Sessions via MCP](https://docs.composio.dev/docs/sessions-via-mcp.md). See any page's .md endpoint for full usage instructions.

${docsTree}

## Examples

${examplesPages.map(formatPage).join('\n')}

## Knowledge Base

${knowledgeDiscoveryLinks}

${knowledgeBasePages.map(formatPage).join('\n')}

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
