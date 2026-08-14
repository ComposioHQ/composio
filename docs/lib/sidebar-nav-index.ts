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
  /** 1-based position within the group, in top-to-bottom sidebar order. */
  position: number;
}

export type SidebarNavIndex = Record<string, SidebarNavEntry>;

/** Sidebar badges wrap names in elements, so only plain names yield text. */
function nodeText(name: ReactNode): string | null {
  if (typeof name === 'string') return name;
  if (typeof name === 'number') return String(name);
  return null;
}

interface WalkState {
  group: string | null;
  position: number;
}

function walkNodes(
  nodes: Node[],
  folder: string | null,
  depth: number,
  state: WalkState,
  index: SidebarNavIndex
): void {
  for (const node of nodes) {
    if (node.type === 'separator') {
      state.group = nodeText(node.name);
      state.position = 0;
      continue;
    }

    if (node.type === 'page') {
      state.position += 1;
      index[node.url] = { group: state.group, folder, depth, position: state.position };
      continue;
    }

    const folderName = nodeText(node.name) ?? folder;

    // A folder's index page is the folder's own row, so it keeps the folder's depth.
    if (node.index) {
      state.position += 1;
      index[node.index.url] = {
        group: state.group,
        folder: folderName,
        depth,
        position: state.position,
      };
    }

    // A separator nested in a folder must not leak into the folder's siblings.
    const outerGroup = state.group;
    walkNodes(node.children, folderName, depth + 1, state, index);
    state.group = outerGroup;
  }
}

export function buildSidebarNavIndex(tree: Root): SidebarNavIndex {
  const index: SidebarNavIndex = {};
  walkNodes(tree.children, null, 1, { group: null, position: 0 }, index);
  return index;
}
