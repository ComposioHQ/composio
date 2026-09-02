import type { Folder, Item, Node, Root } from 'fumadocs-core/page-tree';
import {
  DOCS_PRODUCTS,
  type DocsProduct,
  type ProductSidebarItem,
} from './home-navigation';

function findPage(nodes: Node[], url: string): Item | null {
  for (const node of nodes) {
    if (node.type === 'page' && node.url === url) return node;
    if (node.type === 'folder') {
      if (node.index?.url === url) return node.index;
      const nested = findPage(node.children, url);
      if (nested) return nested;
    }
  }
  return null;
}

function findFolder(nodes: Node[], path: string): Folder | null {
  for (const node of nodes) {
    if (node.type !== 'folder') continue;
    if (node.$ref?.folder === path) return node;
    const nested = findFolder(node.children, path);
    if (nested) return nested;
  }
  return null;
}

function resolveSidebarItem(tree: Root, item: ProductSidebarItem): Node {
  const sourceNode =
    item.type === 'page'
      ? findPage(tree.children, item.url)
      : findFolder(tree.children, item.path);

  if (!sourceNode) {
    const target = item.type === 'page' ? item.url : item.path;
    throw new Error(`Product sidebar target does not exist: ${target}`);
  }

  return item.label ? { ...sourceNode, name: item.label } : sourceNode;
}

export function buildProductPageTree(tree: Root, product: DocsProduct): Root {
  const children = DOCS_PRODUCTS[product].sidebar.flatMap(group => [
    { type: 'separator' as const, name: group.label },
    ...group.items.map(item => resolveSidebarItem(tree, item)),
  ]);

  // Fumadocs memoizes trees by root ID, so each audience needs a distinct ID
  // for client-side product switches to replace the sidebar immediately.
  return { ...tree, $id: `docs-product:${product}`, children };
}

export function pageTreeUrls(tree: Root): string[] {
  const urls: string[] = [];

  function visit(nodes: Node[]): void {
    for (const node of nodes) {
      if (node.type === 'page') {
        urls.push(node.url);
      } else if (node.type === 'folder') {
        if (node.index) urls.push(node.index.url);
        visit(node.children);
      }
    }
  }

  visit(tree.children);
  return urls;
}
