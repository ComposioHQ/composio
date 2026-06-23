/**
 * Appends an "Experimental" badge to sidebar entries whose page frontmatter
 * sets `experimental: true`. Frontmatter-driven so any page can opt in — see
 * `experimental` in `docsSchema` (source.config.ts).
 */
import type { ReactNode } from 'react';
import type { Root, Node, Item } from 'fumadocs-core/page-tree';

function ExperimentalBadge() {
  return (
    <span
      title="Experimental — API may change"
      className="ml-2 inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wide bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/25"
    >
      Experimental
    </span>
  );
}

function withBadge(name: ReactNode): ReactNode {
  return (
    <span className="inline-flex w-full items-center justify-between gap-2">
      <span className="truncate">{name}</span>
      <ExperimentalBadge />
    </span>
  );
}

function decorateItem(item: Item, urls: Set<string>): Item {
  return urls.has(item.url) ? { ...item, name: withBadge(item.name) } : item;
}

function decorateNode(node: Node, urls: Set<string>): Node {
  if (node.type === 'folder') {
    return {
      ...node,
      index: node.index ? decorateItem(node.index, urls) : node.index,
      children: node.children.map((child) => decorateNode(child, urls)),
    };
  }
  if (node.type === 'page') {
    return decorateItem(node, urls);
  }
  return node;
}

/**
 * Returns a new page tree with experimental pages' names wrapped in a badge.
 * No-op when `experimentalUrls` is empty so the original tree is reused.
 */
export function decorateExperimentalPages(tree: Root, experimentalUrls: Set<string>): Root {
  if (experimentalUrls.size === 0) return tree;
  return {
    ...tree,
    children: tree.children.map((node) => decorateNode(node, experimentalUrls)),
  };
}
