/**
 * Adds badges to sidebar entries, frontmatter-driven:
 * - pages with `experimental: true` get an amber "Experimental" badge
 * - pages with `isNew: true` get a green "New" badge
 * - fully legacy folders/sections get a neutral "Legacy" badge
 */
import type { ReactNode } from 'react';
import type { Folder, Root, Node, Item } from 'fumadocs-core/page-tree';

type BadgeTone = 'experimental' | 'new' | 'legacy';

function SidebarBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  const toneClass = {
    experimental:
      'bg-amber-100 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/25',
    new: 'bg-emerald-100 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/25',
    legacy:
      'bg-fd-muted text-fd-muted-foreground ring-fd-border dark:bg-fd-muted/70 dark:text-fd-muted-foreground dark:ring-fd-border',
  }[tone];

  return (
    <span
      className={`ml-2 inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${toneClass}`}
    >
      {label}
    </span>
  );
}

function stripStatusSuffix(name: ReactNode): ReactNode {
  return typeof name === 'string'
    ? name.replace(/\s+\((?:legacy|experimental|new)\)\s*$/i, '').trim()
    : name;
}

function withBadge(name: ReactNode, badge: ReactNode): ReactNode {
  return (
    <span className="inline-flex w-full items-center justify-between gap-2">
      <span className="truncate">{stripStatusSuffix(name)}</span>
      {badge}
    </span>
  );
}

function pageIsLegacy(page: Item | undefined, legacy: Set<string>) {
  return page ? legacy.has(page.url) : false;
}

function legacyState(node: Node, legacy: Set<string>): 'all' | 'some' | 'none' {
  if (node.type === 'page') return legacy.has(node.url) ? 'all' : 'none';
  if (node.type !== 'folder') return 'none';

  const states = [
    ...(node.index ? [pageIsLegacy(node.index, legacy) ? 'all' as const : 'none' as const] : []),
    ...node.children.map((child) => legacyState(child, legacy)),
  ];

  if (states.length === 0 || states.every((state) => state === 'none')) return 'none';
  if (states.every((state) => state === 'all')) return 'all';
  return 'some';
}

function decorateNode(
  node: Node,
  experimental: Set<string>,
  isNew: Set<string>,
  legacy: Set<string>,
  inheritedLegacy = false,
): Node {
  if (node.type === 'folder') {
    const isFullyLegacy = legacyState(node, legacy) === 'all';
    const index = node.index
      ? (decorateNode(node.index, experimental, isNew, legacy, inheritedLegacy || isFullyLegacy) as Item)
      : undefined;
    const children = node.children.map((child) =>
      decorateNode(child, experimental, isNew, legacy, inheritedLegacy || isFullyLegacy),
    );
    const name = isFullyLegacy && !inheritedLegacy
      ? withBadge(node.name, <SidebarBadge label="Legacy" tone="legacy" />)
      : stripStatusSuffix(node.name);

    return {
      ...node,
      name,
      index,
      children,
    } as Folder;
  }
  const cleanName = stripStatusSuffix(node.name);
  if (node.type === 'page' && legacy.has(node.url) && !inheritedLegacy) {
    return { ...node, name: withBadge(cleanName, <SidebarBadge label="Legacy" tone="legacy" />) } as Item;
  }
  if (node.type === 'page' && experimental.has(node.url)) {
    return { ...node, name: withBadge(cleanName, <SidebarBadge label="Exp" tone="experimental" />) } as Item;
  }
  if (node.type === 'page' && isNew.has(node.url)) {
    return { ...node, name: withBadge(cleanName, <SidebarBadge label="New" tone="new" />) } as Item;
  }
  return node.type === 'page' ? { ...node, name: cleanName } : node;
}

/**
 * Returns a new page tree with experimental/new sidebar badges applied.
 * No-op when all sets are empty so the original tree is reused.
 */
export function decorateSidebarBadges(
  tree: Root,
  experimentalUrls: Set<string>,
  newUrls: Set<string>,
  legacyUrls: Set<string>,
): Root {
  if (experimentalUrls.size === 0 && newUrls.size === 0 && legacyUrls.size === 0) return tree;
  return {
    ...tree,
    children: tree.children.map((node) => decorateNode(node, experimentalUrls, newUrls, legacyUrls)),
  };
}
