'use client';

import type { ReactNode } from 'react';
import type { Folder, Item, Node } from 'fumadocs-core/page-tree';
import { usePathname } from 'fumadocs-core/framework';
import Link from 'fumadocs-core/link';
import { useTreePath } from 'fumadocs-ui/contexts/tree';
import {
  SidebarFolder,
  useFolderDepth,
} from 'fumadocs-ui/components/sidebar/base';
import { cn } from '@fumadocs/ui/cn';

function folderLinkPadding(depth: number) {
  return `calc(${2 + 3 * Math.max(depth - 1, 0)} * var(--spacing))`;
}

function getFirstPage(node: Node): Item | undefined {
  if (node.type === 'page') return node;
  if (node.type !== 'folder') return undefined;

  if (node.index) return node.index;

  for (const child of node.children) {
    const page = getFirstPage(child);
    if (page) return page;
  }

  return undefined;
}

function normalizePath(path: string) {
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

function pageMatchesPath(page: Item | undefined, pathname: string) {
  return page?.url !== undefined && normalizePath(page.url) === pathname;
}

function nodeContainsPath(node: Node, pathname: string): boolean {
  if (node.type === 'page') return pageMatchesPath(node, pathname);
  if (node.type !== 'folder') return false;

  return (
    pageMatchesPath(node.index, pathname) ||
    node.children.some((child) => nodeContainsPath(child, pathname))
  );
}

function FolderLink({ item, active }: { item: Folder; active: boolean }) {
  const depth = useFolderDepth();
  const target = item.index ?? item.children.map(getFirstPage).find(Boolean);
  const href = target?.url;

  if (!href) {
    return (
      <div
        data-active={active ? 'true' : 'false'}
        className={cn(
          'docs-sidebar-folder-label relative flex w-full flex-row items-center gap-2 rounded-[var(--composio-radius)] p-2 text-start text-fd-muted-foreground wrap-anywhere',
          'data-[active=true]:bg-fd-primary/10 data-[active=true]:text-fd-primary',
        )}
        style={{ paddingInlineStart: folderLinkPadding(depth) }}
      >
        {item.icon}
        {item.name}
      </div>
    );
  }

  return (
    <Link
      data-active={active ? 'true' : 'false'}
      external={target?.external}
      href={href}
      className={cn(
        'docs-sidebar-folder-label relative flex w-full flex-row items-center gap-2 rounded-[var(--composio-radius)] p-2 text-start text-fd-muted-foreground wrap-anywhere transition-colors',
        'hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none',
        'data-[active=true]:bg-fd-primary/10 data-[active=true]:text-fd-primary',
      )}
      style={{ paddingInlineStart: folderLinkPadding(depth) }}
    >
      {item.icon}
      {item.name}
    </Link>
  );
}

export function DocsSidebarFolder({
  item,
  children,
}: {
  item: Folder;
  children: ReactNode;
}) {
  const path = useTreePath();
  const pathname = normalizePath(usePathname());
  const active = path.includes(item) || nodeContainsPath(item, pathname);
  const open = item.defaultOpen === true || active;

  return (
    <SidebarFolder active={active} collapsible={false}>
      <FolderLink item={item} active={active} />
      {/* `defaultOpen: true` (meta.json or ALWAYS_OPEN_SECTIONS) reveals this
          folder's children whenever the folder is visible; otherwise children
          disclose progressively while the folder is active. Non-recursive:
          each nested folder decides for itself. */}
      <div
        aria-hidden={!open}
        data-open={open ? 'true' : 'false'}
        inert={!open}
        className="docs-sidebar-folder-content"
      >
        <div className="docs-sidebar-folder-content-inner">
          {children}
        </div>
      </div>
    </SidebarFolder>
  );
}
