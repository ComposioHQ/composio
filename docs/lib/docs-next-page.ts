import type { Item, Node, Root } from 'fumadocs-core/page-tree';

export interface DocsNextPage {
  name: string;
  url: string;
  external?: boolean;
  /** Chapter: the top-level sidebar section (a meta separator or a top-level folder). */
  chapter?: string;
  /** Subheading: a nested folder or nested separator inside the chapter, when present. */
  section?: string;
}

export interface DocsAdjacentPages {
  previous?: DocsNextPage;
  next?: DocsNextPage;
}

export interface DocsOutline {
  /** Every reachable page in reading order, labelled with its chapter/section. */
  pages: DocsNextPage[];
  /** Normalized URL -> position in `pages`, for O(1) adjacency lookups. */
  indexByUrl: Map<string, number>;
}

function normalizePath(path: string) {
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

function nodeName(name: unknown): string | undefined {
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

function pageEntry(page: Item, chapter?: string, section?: string): DocsNextPage {
  return {
    name: nodeName(page.name) ?? '',
    url: page.url,
    external: page.external,
    chapter,
    section,
  };
}

/**
 * One depth-first pass over the page tree, labelling every page with the
 * chapter/subheading it sits under:
 * - depth 0: separators and folders both start a new chapter
 * - deeper: separators and folders become subheadings within the chapter
 */
function walk(
  children: Node[],
  pages: DocsNextPage[],
  depth: number,
  chapter?: string,
  section?: string,
): void {
  for (const child of children) {
    if (child.type === 'separator') {
      const name = nodeName(child.name);
      if (depth === 0) {
        chapter = name ?? chapter;
        section = undefined;
      } else {
        section = name ?? section;
      }
      continue;
    }

    if (child.type === 'page') {
      pages.push(pageEntry(child, chapter, section));
      continue;
    }

    if (child.type !== 'folder') continue;
    const name = nodeName(child.name);
    const childChapter = depth === 0 ? (name ?? chapter) : chapter;
    const childSection = depth === 0 ? undefined : (name ?? section);
    if (child.index) pages.push(pageEntry(child.index, childChapter, childSection));
    walk(child.children, pages, depth + 1, childChapter, childSection);
  }
}

// The tree is built once at module scope (per server process; per HMR pass in
// dev), so keying the cache on the Root object gives one walk per tree instead
// of one walk + linear scan per request.
const outlineCache = new WeakMap<Root, DocsOutline>();

export function getDocsOutline(tree: Root): DocsOutline {
  const cached = outlineCache.get(tree);
  if (cached) return cached;

  const pages: DocsNextPage[] = [];
  walk(tree.children, pages, 0);

  const indexByUrl = new Map<string, number>();
  pages.forEach((page, index) => {
    const key = normalizePath(page.url);
    // First occurrence wins, matching the old findIndex semantics when a page
    // is referenced from more than one place in the meta.
    if (!indexByUrl.has(key)) indexByUrl.set(key, index);
  });

  const outline: DocsOutline = { pages, indexByUrl };
  outlineCache.set(tree, outline);
  return outline;
}

export function getNextDocsPage(tree: Root, currentUrl: string): DocsNextPage | undefined {
  return getAdjacentDocsPages(tree, currentUrl).next;
}

export function getAdjacentDocsPages(tree: Root, currentUrl: string): DocsAdjacentPages {
  const { pages, indexByUrl } = getDocsOutline(tree);
  const index = indexByUrl.get(normalizePath(currentUrl));
  if (index === undefined) return {};

  return {
    previous: pages[index - 1],
    next: pages[index + 1],
  };
}
