import type { Folder, Item, Node, Root, Separator } from 'fumadocs-core/page-tree';

function separatorName(node: Separator): string | undefined {
  return typeof node.name === 'string' ? node.name : undefined;
}

function makeSectionFolder(section: Separator, children: Node[]): Folder | undefined {
  const name = separatorName(section);
  if (!name || children.length === 0) return undefined;

  const first = children[0];
  if (first.type !== 'page') {
    return {
      type: 'folder',
      name,
      children,
      defaultOpen: false,
    };
  }

  return {
    type: 'folder',
    name,
    index: first as Item,
    children: children.slice(1),
    defaultOpen: false,
  };
}

/**
 * Convert top-level meta separators into collapsed section folders.
 * The section heading links to the first page in that section; opening it
 * reveals the remaining pages below.
 */
export function groupSidebarSections(tree: Root): Root {
  const grouped: Node[] = [];
  let activeSection: Separator | undefined;
  let activeChildren: Node[] = [];

  function flushSection() {
    if (!activeSection) {
      grouped.push(...activeChildren);
    } else {
      const folder = makeSectionFolder(activeSection, activeChildren);
      if (folder) grouped.push(folder);
    }

    activeSection = undefined;
    activeChildren = [];
  }

  for (const child of tree.children) {
    if (child.type === 'separator') {
      flushSection();
      activeSection = child;
      continue;
    }

    activeChildren.push(child);
  }

  flushSection();

  return {
    ...tree,
    children: grouped,
  };
}
