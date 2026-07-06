import type { Folder, Item, Node, Root, Separator } from 'fumadocs-core/page-tree';

/**
 * Sections (top-level meta separators) whose children are always visible in
 * the sidebar. Everything else uses progressive disclosure: children appear
 * only while the section is active. Real folders opt in per-folder with
 * `"defaultOpen": true` in their meta.json — the flag is NOT recursive; a
 * revealed folder shows its children, but grandchildren follow their own
 * folder's flag.
 */
const ALWAYS_OPEN_SECTIONS = new Set(['Get Started', 'Customizing sessions', 'Sandboxes']);

function separatorName(node: Separator): string | undefined {
  return typeof node.name === 'string' ? node.name : undefined;
}

function isFolderIndexPage(folder: Folder, page: Node | undefined): page is Item {
  return (
    page?.type === 'page' &&
    (page.name === 'Index' || page.name === folder.name)
  );
}

function normalizeFolderIndex(node: Node): Node {
  if (node.type !== 'folder') return node;

  const children = node.children.map(normalizeFolderIndex);
  const [firstChild, ...remainingChildren] = children;
  const index = node.index ?? (isFolderIndexPage(node, firstChild) ? firstChild : undefined);

  return {
    ...node,
    index,
    children: index === node.index ? children : remainingChildren,
  };
}

function isStandaloneIndexedFolder(node: Node): node is Folder {
  return (
    node.type === 'folder' &&
    node.index !== undefined &&
    (node.name === 'Sandboxes' || node.name === 'Triggers')
  );
}

function makeSectionFolder(section: Separator, children: Node[]): Folder | undefined {
  const name = separatorName(section);
  if (!name || children.length === 0) return undefined;

  const first = children[0];
  if (children.length === 1 && first.type === 'folder' && first.name === name) {
    const [firstChild, ...remainingChildren] = first.children;
    const index = first.index ?? (firstChild?.type === 'page' ? firstChild : undefined);

    return {
      ...first,
      index,
      children: index === first.index ? first.children : remainingChildren,
      defaultOpen: ALWAYS_OPEN_SECTIONS.has(name) || first.defaultOpen === true,
    };
  }

  if (first.type !== 'page') {
    return {
      type: 'folder',
      name,
      children,
      defaultOpen: ALWAYS_OPEN_SECTIONS.has(name),
    };
  }

  return {
    type: 'folder',
    name,
    index: first as Item,
    children: children.slice(1),
    defaultOpen: ALWAYS_OPEN_SECTIONS.has(name),
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

    const normalized = normalizeFolderIndex(child);
    if (isStandaloneIndexedFolder(normalized)) {
      flushSection();
      grouped.push({
        ...normalized,
        // Standalone folders honor the same always-open config as sections.
        defaultOpen:
          normalized.defaultOpen === true ||
          (typeof normalized.name === 'string' && ALWAYS_OPEN_SECTIONS.has(normalized.name)),
      });
      continue;
    }

    activeChildren.push(normalized);
  }

  flushSection();

  return {
    ...tree,
    children: grouped,
  };
}
