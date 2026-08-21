import {
  getLLMText,
  source,
  examplesSource,
  referenceSource,
  toolkitsSource,
  knowledgeBaseSource,
  type LLMPage,
} from '@/lib/source';
import { SESSION_GUARDRAILS } from '@/lib/llm-guardrails';
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

// Generic page type that works for all sources
type PageLike = LLMPage & { slugs: string[] };

/**
 * Collect page URLs from the page tree in sidebar order.
 * This ensures pages appear in the same order as the docs sidebar.
 */
function collectPageUrls(nodes: TreeNode[]): string[] {
  const urls: string[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case 'page':
        urls.push(node.url);
        break;

      case 'folder':
        if (node.index) {
          urls.push(node.index.url);
        }
        urls.push(...collectPageUrls(node.children));
        break;

      // separators don't have URLs
    }
  }

  return urls;
}

/** All page URLs under a folder, including its index. */
function collectFolderUrls(folder: FolderNode): string[] {
  const urls: string[] = [];
  if (folder.index) urls.push(folder.index.url);
  for (const child of folder.children) {
    if (child.type === 'page') urls.push(child.url);
    else if (child.type === 'folder') urls.push(...collectFolderUrls(child));
  }
  return urls;
}

/**
 * URLs that live under a legacy/deprecated separator section (e.g. "Direct
 * Tool Execution Guides (Legacy)"). We drop their full text from the default
 * LLM context so generators don't learn deprecated patterns.
 */
function collectLegacyUrls(nodes: TreeNode[]): Set<string> {
  const legacy = new Set<string>();
  let inLegacySection = false;

  for (const node of nodes) {
    if (node.type === 'separator') {
      const text = typeof node.name === 'string' ? node.name : '';
      inLegacySection = /legacy|deprecated/i.test(text);
      continue;
    }
    if (!inLegacySection) continue;
    if (node.type === 'page') legacy.add(node.url);
    else if (node.type === 'folder') {
      for (const url of collectFolderUrls(node)) legacy.add(url);
    }
  }

  return legacy;
}

/**
 * Order pages according to the page tree structure from meta.json.
 * Pages not in the tree are appended at the end.
 */
function orderDocPages(pages: PageLike[], treeNodes: TreeNode[]): PageLike[] {
  const orderedUrls = collectPageUrls(treeNodes);
  const urlOrder = new Map(orderedUrls.map((url, i) => [url, i]));

  return [...pages].sort((a, b) => {
    const orderA = urlOrder.get(a.url) ?? 999;
    const orderB = urlOrder.get(b.url) ?? 999;
    return orderA - orderB;
  });
}

async function getTextForPages(pages: PageLike[]) {
  return Promise.all(
    pages.map(async page => {
      try {
        return await getLLMText(page, {
          includeFooter: false,
          includeGuardrails: false,
        });
      } catch {
        return `# ${page.data.title} (${page.url})\n\n${page.data.description || ''}`;
      }
    })
  );
}

export async function GET() {
  try {
    const treeChildren = source.pageTree.children as TreeNode[];
    const legacyUrls = collectLegacyUrls(treeChildren);
    const orderedDocsPages = orderDocPages(
      source.getPages().filter(page => !legacyUrls.has(page.url)),
      treeChildren
    );
    const knowledgeDiscoveryLinks = formatKnowledgeDiscoveryLinks(
      (await getLocalKnowledgeDiscoveryPaths()).filter(
        (path) => !path.startsWith('/kb/guide/'),
      ),
    );

    const [
      docsResults,
      knowledgeBaseResults,
      examplesResults,
      referenceResults,
      toolkitsResults,
    ] = await Promise.all([
      getTextForPages(orderedDocsPages),
      getTextForPages(knowledgeBaseSource.getPages()),
      getTextForPages(examplesSource.getPages()),
      getTextForPages(
        referenceSource.getPages().filter(page => detectReferenceApiVersion(page.url) !== '3.0')
      ),
      getTextForPages(toolkitsSource.getPages()),
    ]);

    const results = [
      `# Composio Documentation\n\n> Composio powers 1000+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.${SESSION_GUARDRAILS}\n# Documentation\n`,
      ...docsResults,
      '\n# Knowledge Hub navigation\n',
      knowledgeDiscoveryLinks,
      '\n# Knowledge Base\n',
      ...knowledgeBaseResults,
      '\n# Examples\n',
      ...examplesResults,
      '\n# API Reference\n',
      ...referenceResults,
      '\n# Toolkits\n',
      ...toolkitsResults,
    ];

    return new Response(results.join('\n\n---\n\n'), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('[llms-full.txt] Error generating content:', error);
    return new Response('Error generating LLM content', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}
