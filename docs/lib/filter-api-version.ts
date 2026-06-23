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

/**
 * API-reference tags that we intentionally hide on our side even though the
 * upstream OpenAPI spec (from hermes) still includes them. Matched by tag slug.
 *
 * Hiding happens in two places that must stay in sync:
 *  - `scripts/generate-api-index.ts` skips generating (and deletes) their
 *    `index.mdx` overview pages.
 *  - `filterHiddenTags` (below) drops their folders/pages from the reference
 *    page tree so the fumadocs-openapi operation pages disappear from the
 *    sidebar, llms.txt walk, and search.
 */
export const HIDDEN_API_TAGS: ReadonlySet<string> = new Set([
  'consumer',
  'invite-codes',
  'authentication',
]);

/** True if a URL points at a hidden tag's pages (v3.1 or v3.0). */
function isHiddenTagUrl(url: string): boolean {
  for (const tag of HIDDEN_API_TAGS) {
    if (
      url.startsWith(`/reference/api-reference/${tag}/`) ||
      url === `/reference/api-reference/${tag}` ||
      url.startsWith(`/reference/v3/api-reference/${tag}/`) ||
      url === `/reference/v3/api-reference/${tag}`
    ) {
      return true;
    }
  }
  return false;
}

/** True if a node (page or folder) belongs entirely to a hidden tag. */
function isHiddenTagNode(node: PageTreeNode): boolean {
  if (node.type === 'page' && typeof node.url === 'string') {
    return isHiddenTagUrl(node.url);
  }
  if (node.type === 'folder') {
    if (node.index && isHiddenTagNode(node.index)) return true;
    // A folder whose every child is hidden (and has at least one) is itself hidden.
    const children = node.children ?? [];
    if (children.length > 0 && children.every(isHiddenTagNode)) return true;
  }
  return false;
}

/** Recursively drops folders/pages whose tag slug is in HIDDEN_API_TAGS. */
function filterHiddenTags(nodes: PageTreeNode[]): PageTreeNode[] {
  return nodes
    .filter((node) => !isHiddenTagNode(node))
    .map((node) =>
      node.type === 'folder' && node.children
        ? { ...node, children: filterHiddenTags(node.children) }
        : node,
    );
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
  // Drop intentionally-hidden tags (consumer, invite-codes) from the whole tree
  // first, so neither version surfaces their operation pages.
  const children = filterHiddenTags(tree.children as PageTreeNode[]);

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
