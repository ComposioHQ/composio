import { getLLMText, source, examplesSource, referenceSource, toolkitsSource } from '@/lib/source';
import type { ReactNode } from 'react';

/**
 * Shared machinery for the llms full-text endpoints. /llms-full.txt bundles
 * everything (~170k tokens — more than most agents can spend), so the
 * sectioned endpoints (/llms-docs.txt, /llms-examples.txt,
 * /llms-reference.txt) serve one slice each, in sidebar order.
 */

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

export type TreeNode = PageNode | SeparatorNode | FolderNode;

export interface PageLike {
  url: string;
  slugs: string[];
  data: {
    title: string;
    description?: string;
    legacy?: boolean;
  };
}

export const LLMS_HEADER = `# Composio Documentation

> Composio powers 1000+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.`;

/** Collect page URLs from the page tree in sidebar order. */
function collectPageUrls(nodes: TreeNode[]): string[] {
  const urls: string[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'page':
        urls.push(node.url);
        break;
      case 'folder':
        if (node.index) urls.push(node.index.url);
        urls.push(...collectPageUrls(node.children));
        break;
      // separators don't have URLs
    }
  }
  return urls;
}

/** Order pages by the page tree (meta.json order); unknown pages sort last. */
export function orderDocPages(pages: PageLike[], treeNodes: TreeNode[]): PageLike[] {
  const orderedUrls = collectPageUrls(treeNodes);
  const urlOrder = new Map(orderedUrls.map((url, i) => [url, i]));
  return [...pages].sort(
    (a, b) => (urlOrder.get(a.url) ?? 999) - (urlOrder.get(b.url) ?? 999),
  );
}

export async function getTextForPages(pages: PageLike[]) {
  return Promise.all(
    pages.map(async (page) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await getLLMText(page as any, { includeFooter: false, includeGuardrails: false });
      } catch {
        return `# ${page.data.title} (${page.url})\n\n${page.data.description || ''}`;
      }
    }),
  );
}

export function orderedDocsPages(): PageLike[] {
  return orderDocPages(
    (source.getPages() as PageLike[]).filter((page) => page.data.legacy !== true),
    source.pageTree.children as TreeNode[],
  );
}

export function currentReferencePages(): PageLike[] {
  // Legacy v3.0 reference pages are near-duplicates of v3.1 — skip them here;
  // llms.txt points at them under "Optional".
  return (referenceSource.getPages() as PageLike[]).filter(
    (page) => !page.url.startsWith('/reference/v3/'),
  );
}

export function examplesPages(): PageLike[] {
  return examplesSource.getPages() as PageLike[];
}

export function toolkitStaticPages(): PageLike[] {
  return toolkitsSource.getPages() as PageLike[];
}

export function textResponse(body: string) {
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function buildSectionResponse(title: string, pages: PageLike[]) {
  const texts = await getTextForPages(pages);
  return textResponse([`${LLMS_HEADER}\n\n# ${title}\n`, ...texts].join('\n\n---\n\n'));
}
