import type { Item, Node, Root } from 'fumadocs-core/page-tree';

export interface DocsNextPage {
  name: string;
  url: string;
  external?: boolean;
}

function normalizePath(path: string) {
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

function appendPage(page: Item, pages: DocsNextPage[]) {
  pages.push({
    name: typeof page.name === 'string' ? page.name : '',
    url: page.url,
    external: page.external,
  });
}

function appendNodePages(node: Node, pages: DocsNextPage[]) {
  if (node.type === 'page') {
    appendPage(node, pages);
    return;
  }

  if (node.type !== 'folder') return;

  if (node.index) appendPage(node.index, pages);
  for (const child of node.children) {
    appendNodePages(child, pages);
  }
}

export function getNextDocsPage(tree: Root, currentUrl: string): DocsNextPage | undefined {
  const pages: DocsNextPage[] = [];
  for (const child of tree.children) {
    appendNodePages(child, pages);
  }

  const current = normalizePath(currentUrl);
  const index = pages.findIndex((page) => normalizePath(page.url) === current);

  return index >= 0 ? pages[index + 1] : undefined;
}
