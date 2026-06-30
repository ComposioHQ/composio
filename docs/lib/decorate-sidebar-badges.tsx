/**
 * Adds badges to sidebar entries, frontmatter-driven:
 * - pages with `experimental: true` get an amber "Experimental" badge
 * - pages with `isNew: true` get a green "New" badge
 *
 * Legacy pages are NOT badged here: the sidebar already groups them under a
 * "...(Legacy)" section header, so a per-item "Legacy" pill is redundant
 * (and stacked right under that header it reads as a double "Legacy").
 */
import type { ReactNode } from 'react';
import type { Root, Node, Item } from 'fumadocs-core/page-tree';

function SidebarBadge({ label, tone }: { label: string; tone: 'experimental' | 'new' }) {
  const toneClass =
    tone === 'experimental'
      ? 'bg-amber-100 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/25'
      : 'bg-emerald-100 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/25';
  return (
    <span
      className={`ml-2 inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${toneClass}`}
    >
      {label}
    </span>
  );
}

function withBadge(name: ReactNode, badge: ReactNode): ReactNode {
  return (
    <span className="inline-flex w-full items-center justify-between gap-2">
      <span className="truncate">{name}</span>
      {badge}
    </span>
  );
}

function decorateNode(node: Node, experimental: Set<string>, isNew: Set<string>): Node {
  if (node.type === 'folder') {
    return {
      ...node,
      children: node.children.map((child) => decorateNode(child, experimental, isNew)),
    };
  }
  if (node.type === 'page' && experimental.has(node.url)) {
    return { ...node, name: withBadge(node.name, <SidebarBadge label="Exp" tone="experimental" />) } as Item;
  }
  if (node.type === 'page' && isNew.has(node.url)) {
    return { ...node, name: withBadge(node.name, <SidebarBadge label="New" tone="new" />) } as Item;
  }
  return node;
}

/**
 * Returns a new page tree with experimental/new sidebar badges applied.
 * No-op when all sets are empty so the original tree is reused.
 */
export function decorateSidebarBadges(
  tree: Root,
  experimentalUrls: Set<string>,
  newUrls: Set<string>,
): Root {
  if (experimentalUrls.size === 0 && newUrls.size === 0) return tree;
  return {
    ...tree,
    children: tree.children.map((node) => decorateNode(node, experimentalUrls, newUrls)),
  };
}
