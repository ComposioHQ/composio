/**
 * Flattens a fumadocs page tree into a url -> sidebar-position lookup.
 *
 * Analytics needs to know which sidebar group a click came from, and the
 * rendered sidebar cannot answer that: separators render as `<p>` and folders
 * as `<button>`, both fumadocs-internal details that change on upgrade. The
 * tree is the stable source, so the mapping is derived here at build time and
 * the click handler only does an href lookup.
 *
 * Mirrors the traversal in `app/llms.txt/route.ts`.
 */
import type { ReactNode } from 'react';
import type { Root, Node } from 'fumadocs-core/page-tree';

export interface SidebarNavEntry {
  /** Enclosing separator heading, e.g. "Core concepts". */
  group: string | null;
  /** Enclosing folder title, e.g. "Authentication"; null at the top level. */
  folder: string | null;
  /** 1 = top-level row, 2 = folder child, 3 = nested. */
  depth: number;
  /**
   * 1-based position among sibling rows, counting only this level: a folder
   * occupies one row whether or not it is expanded, and its children get their
   * own 1..n sequence. Counting through folders instead would report a
   * collapsed folder's hidden children as rows the reader had to scroll past.
   */
  position: number;
}

export type SidebarNavIndex = Record<string, SidebarNavEntry>;

/** Sidebar badges wrap names in elements, so only plain names yield text. */
function nodeText(name: ReactNode): string | null {
  if (typeof name === 'string') return name;
  if (typeof name === 'number') return String(name);
  return null;
}

/**
 * `group` and `position` are per-level locals, so a separator nested inside a
 * folder can only affect that folder's own children — it cannot reset the
 * counter or the heading for the folder's siblings.
 */
function walkNodes(
  nodes: Node[],
  folder: string | null,
  depth: number,
  parentGroup: string | null,
  index: SidebarNavIndex
): void {
  let group = parentGroup;
  let position = 0;

  for (const node of nodes) {
    if (node.type === 'separator') {
      group = nodeText(node.name);
      position = 0;
      continue;
    }

    position += 1;

    if (node.type === 'page') {
      index[node.url] = { group, folder, depth, position };
      continue;
    }

    const folderName = nodeText(node.name);

    // A folder's index page is reached by clicking the folder's own row, so it
    // keeps the folder's depth and position rather than its children's.
    if (node.index) {
      index[node.index.url] = { group, folder: folderName, depth, position };
    }

    walkNodes(node.children, folderName, depth + 1, group, index);
  }
}

export function buildSidebarNavIndex(tree: Root): SidebarNavIndex {
  const index: SidebarNavIndex = {};
  walkNodes(tree.children, null, 1, null, index);
  return index;
}
