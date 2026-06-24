/**
 * Adds badges to sidebar entries, frontmatter-driven:
 * - pages with `experimental: true` get an amber "Experimental" badge
 * - pages with `isNew: true` get a green "New" badge
 * - folders whose pages are all `legacy: true` get a gray "Legacy" badge
 *   (e.g. the Direct Tool Execution "Tools" and "Authentication" dropdowns)
 */
import type { ReactNode } from 'react';
import type { Root, Node, Item, Folder } from 'fumadocs-core/page-tree';

function SidebarBadge({ label, tone }: { label: string; tone: 'experimental' | 'new' | 'legacy' }) {
  const toneClass =
    tone === 'experimental'
      ? 'bg-amber-100 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/25'
      : tone === 'new'
        ? 'bg-emerald-100 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/25'
        : 'bg-fd-muted text-fd-muted-foreground ring-fd-border';
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

/** All page URLs under a folder, including its index. */
function folderPageUrls(folder: Folder): string[] {
  const urls: string[] = [];
  if (folder.index) urls.push(folder.index.url);
  for (const child of folder.children) {
    if (child.type === 'page') urls.push(child.url);
    else if (child.type === 'folder') urls.push(...folderPageUrls(child));
  }
  return urls;
}

function decorateNode(node: Node, experimental: Set<string>, isNew: Set<string>, legacy: Set<string>): Node {
  if (node.type === 'folder') {
    const decorated: Folder = {
      ...node,
      children: node.children.map((child) => decorateNode(child, experimental, isNew, legacy)),
    };
    // A folder is legacy when every page under it is legacy.
    const urls = folderPageUrls(node);
    if (urls.length > 0 && urls.every((u) => legacy.has(u))) {
      return { ...decorated, name: withBadge(decorated.name, <SidebarBadge label="Legacy" tone="legacy" />) };
    }
    return decorated;
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
 * Returns a new page tree with experimental/new/legacy sidebar badges applied.
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
