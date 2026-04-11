/**
 * Filters the combined page tree to show only the selected API version.
 * v3.1 pages are at /reference/{page} and /reference/api-reference/{tag}/{op}
 * v3.0 pages are at /reference/v3/{page} and /reference/v3/api-reference/{tag}/{op}
 *
 * For v3.1: hide the V3 folder entirely.
 * For v3.0: lift V3 folder contents to the top, hide v3.1-only nodes.
 */

interface PageTreeNode {
  type: 'page' | 'folder' | 'separator';
  name?: unknown;
  url?: string;
  children?: PageTreeNode[];
  index?: PageTreeNode;
  [key: string]: unknown;
}

interface PageTreeRoot {
  children: PageTreeNode[];
  [key: string]: unknown;
}

function isV3Node(node: PageTreeNode): boolean {
  if (node.type === 'page' && typeof node.url === 'string') {
    return node.url.startsWith('/reference/v3/') || node.url === '/reference/v3';
  }
  if (node.type === 'folder') {
    if (node.index && isV3Node(node.index)) return true;
    return node.children?.some(isV3Node) ?? false;
  }
  return false;
}

/** Checks if a folder contains v3.1 API reference pages (URLs under /reference/api-reference/). */
function isV31ApiFolder(node: PageTreeNode): boolean {
  if (node.type !== 'folder') return false;
  const hasV31ApiPage = (n: PageTreeNode): boolean => {
    if (n.type === 'page' && typeof n.url === 'string') {
      return n.url.startsWith('/reference/api-reference/');
    }
    if (n.type === 'folder') {
      if (n.index && hasV31ApiPage(n.index)) return true;
      return n.children?.some(hasV31ApiPage) ?? false;
    }
    return false;
  };
  if (node.index && hasV31ApiPage(node.index)) return true;
  return node.children?.some(hasV31ApiPage) ?? false;
}

export function prepareTree<T extends PageTreeRoot>(tree: T, version: string): T {
  const children = tree.children as PageTreeNode[];

  if (version === '3.1') {
    // Just hide the V3 folder
    return {
      ...tree,
      children: children.filter((node) => !isV3Node(node)),
    };
  }

  // v3.0: lift V3 folder contents, keep version-independent folders (SDK Reference, Meta Tools)
  const v3Folder = children.find(
    (node) => node.type === 'folder' && isV3Node(node),
  );

  // Nodes that should appear in both versions (exclude v3 nodes, v3.1 API Reference folder,
  // and top-level pages which are version-specific — both versions have their own copies)
  const sharedNodes = children.filter(
    (node) => node.type !== 'page' && !isV3Node(node) && !isV31ApiFolder(node),
  );

  if (v3Folder?.children) {
    // Include the folder's index page (v3/index.mdx → overview) which fumadocs
    // stores in .index rather than .children
    const indexPage = v3Folder.index ? [v3Folder.index] : [];
    return { ...tree, children: [...indexPage, ...v3Folder.children, ...sharedNodes] };
  }

  return { ...tree, children: [...children.filter(isV3Node), ...sharedNodes] };
}
