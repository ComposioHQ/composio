import {
  getLLMText,
  source,
  examplesSource,
  referenceSource,
  toolkitsSource,
  type LLMPage,
} from '@/lib/source';
import { SESSION_GUARDRAILS } from '@/lib/llm-guardrails';
import { detectApiVersion } from '@/lib/api-version';
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

/** Joins the emitted sections, byte-for-byte what `results.join()` produced. */
const SECTION_SEPARATOR = '\n\n---\n\n';

async function getTextForPage(page: PageLike) {
  try {
    return await getLLMText(page, {
      includeFooter: false,
      includeGuardrails: false,
    });
  } catch {
    // Graceful fallback if getText fails
    return `# ${page.data.title} (${page.url})\n\n${page.data.description || ''}`;
  }
}

async function* getTextForPages(pages: PageLike[]): AsyncGenerator<string> {
  // Sequential on purpose: `Promise.all` over the whole corpus kept every
  // rendered page alive at once. Rendering is synchronous CPU work anyway, so
  // fanning out buys no parallelism — it only raises the high-water mark.
  for (const page of pages) {
    yield await getTextForPage(page);
  }
}

/**
 * The page lists, resolved eagerly. Enumerating the sources is what can realistically
 * fail for the whole response, and it has to fail before the stream starts so the
 * route can still answer 500 rather than tearing a 200 in half.
 */
function collectSections(): { heading: string; pages: PageLike[] }[] {
  const treeChildren = source.pageTree.children as TreeNode[];
  const legacyUrls = collectLegacyUrls(treeChildren);

  return [
    {
      heading: `# Composio Documentation\n\n> Composio powers 1000+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.${SESSION_GUARDRAILS}\n# Documentation\n`,
      pages: orderDocPages(
        source.getPages().filter(page => !legacyUrls.has(page.url)),
        treeChildren
      ),
    },
    { heading: '\n# Examples\n', pages: examplesSource.getPages() },
    {
      heading: '\n# API Reference\n',
      // v3.0 page text is dropped from the default LLM context so generators
      // do not learn the superseded prefix — the same reasoning the legacy
      // separator sections already get above. This removes the MDX pages under
      // content/reference/v3/; operation pages were never in this route, which
      // reads the synchronous MDX-only reference source. Filtered with
      // detectApiVersion, not a literal path test.
      pages: referenceSource.getPages().filter(page => detectApiVersion(page.url) === '3.1'),
    },
    { heading: '\n# Toolkits\n', pages: toolkitsSource.getPages() },
  ];
}

/**
 * Every part of the response, in order, one page at a time. The caller writes
 * `SECTION_SEPARATOR` between consecutive yields, which reproduces the old
 * `[...].join('\n\n---\n\n')` exactly.
 */
async function* llmsFullParts(sections: { heading: string; pages: PageLike[] }[]) {
  for (const section of sections) {
    yield section.heading;
    yield* getTextForPages(section.pages);
  }
}

/**
 * Streams the parts out instead of materialising the whole corpus twice (once
 * as an array of rendered pages, once as the joined string). Only the page
 * being rendered is held.
 */
export function partsToStream(parts: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const separator = encoder.encode(SECTION_SEPARATOR);
  const iterator = parts[Symbol.asyncIterator]();
  let wroteFirst = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        if (wroteFirst) controller.enqueue(separator);
        controller.enqueue(encoder.encode(value));
        wroteFirst = true;
      } catch (error) {
        console.error('[llms-full.txt] Error generating content:', error);
        controller.error(error);
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}

export function GET() {
  try {
    return new Response(partsToStream(llmsFullParts(collectSections())), {
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
