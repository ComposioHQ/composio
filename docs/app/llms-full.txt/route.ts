import { getLLMText, source, cookbooksSource, referenceSource, toolkitsSource } from '@/lib/source';
import { SESSION_GUARDRAILS } from '@/lib/llm-guardrails';
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
interface PageLike {
  url: string;
  slugs: string[];
  data: {
    title: string;
    description?: string;
  };
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTextForPages(pages: PageLike[]) {
  return Promise.all(
    pages.map(async (page) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await getLLMText(page as any, { includeFooter: false, includeGuardrails: false });
      } catch {
        // Graceful fallback if getText fails
        return `# ${page.data.title} (${page.url})\n\n${page.data.description || ''}`;
      }
    })
  );
}

export async function GET() {
  try {
    const orderedDocsPages = orderDocPages(
      source.getPages() as PageLike[],
      source.pageTree.children as TreeNode[]
    );

    const [docsResults, cookbooksResults, referenceResults, toolkitsResults] = await Promise.all([
      getTextForPages(orderedDocsPages),
      getTextForPages(cookbooksSource.getPages() as PageLike[]),
      getTextForPages(referenceSource.getPages() as PageLike[]),
      getTextForPages(toolkitsSource.getPages() as PageLike[]),
    ]);

    const results = [
      `# Composio Documentation\n\n> Composio powers 1000+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.${SESSION_GUARDRAILS}\n# Documentation\n`,
      ...docsResults,
      '\n# Cookbooks\n',
      ...cookbooksResults,
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
