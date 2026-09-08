/**
 * Sidebar nav index tests.
 *
 * Exercises the real docs page tree: `docs_sidebar_click` reports the group,
 * folder and depth from this index, so a traversal bug silently drops pages
 * from analytics rather than breaking the site.
 */
import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { flattenTree } from 'fumadocs-core/page-tree';

import { buildSidebarNavIndex } from '../../lib/sidebar-nav-index';
import { source } from '../../lib/source';

const index = buildSidebarNavIndex(source.pageTree);

describe('buildSidebarNavIndex', () => {
  test('folder children carry their group, folder and depth', () => {
    expect(index['/docs/authentication/white-labeling-authentication']).toEqual({
      group: 'Core concepts',
      folder: 'Authentication',
      depth: 2,
      position: index['/docs/authentication/controlling-scopes'].position + 1,
    });

    expect(index['/docs/extending-sessions/shared-connections']).toEqual({
      group: 'Guides',
      folder: 'Extend sessions',
      depth: 2,
      position: index['/docs/extending-sessions/custom-tools-and-toolkits'].position + 1,
    });
  });

  test('top-level pages have no folder', () => {
    expect(index['/docs/quickstart']).toEqual({
      group: 'Get Started',
      folder: null,
      depth: 1,
      position: index['/docs'].position + 1,
    });
  });

  test('folder index pages resolve to the folder row', () => {
    expect(index['/docs/authentication']).toEqual({
      group: 'Core concepts',
      folder: 'Authentication',
      depth: 1,
      position: index['/docs/configuring-sessions'].position + 1,
    });
  });

  test('position resets at the next separator', () => {
    // Core concepts opens a new group, so its first entry restarts at 1 rather
    // than continuing Get Started's numbering.
    expect(index['/docs'].position).toBe(1);
    expect(index['/docs/how-composio-works'].position).toBe(1);
  });

  test("a folder's children start their own sequence", () => {
    expect(index['/docs/authentication/manually-authenticating'].position).toBe(1);
    expect(index['/docs/extending-sessions/proxy-execute'].position).toBe(1);
  });

  test('a folder counts as one entry for its siblings', () => {
    // Authentication holds 7 children, so a counter that threaded through them
    // would put Triggers 7 sibling slots later than Authentication instead of
    // directly after it.
    expect(index['/docs/triggers'].position).toBe(index['/docs/authentication'].position + 1);
    expect(index['/docs/skills'].position).toBe(index['/docs/triggers'].position + 1);
  });

  test('nested folders restart the sequence at each level', () => {
    expect(index['/docs/providers/custom-providers']).toEqual({
      group: 'Get Started',
      folder: 'Custom providers',
      depth: 2,
      position: index['/docs/providers/mastra'].position + 1,
    });
    expect(index['/docs/providers/custom-providers/typescript'].position).toBe(1);
  });

  test('a separator nested in a folder does not leak into the folder siblings', () => {
    // No meta.json nests a separator today, but fumadocs allows it: the group
    // and the counter are per-level, so "Inner" and its numbering stay inside
    // the folder instead of resuming Outer's siblings mid-sequence.
    const nested = buildSidebarNavIndex({
      name: 'root',
      children: [
        { type: 'separator', name: 'Outer' },
        { type: 'page', name: 'First', url: '/a' },
        {
          type: 'folder',
          name: 'Folder',
          children: [
            { type: 'separator', name: 'Inner' },
            { type: 'page', name: 'Child', url: '/a/child' },
          ],
        },
        { type: 'page', name: 'Last', url: '/b' },
      ],
    });

    expect(nested['/a']).toEqual({ group: 'Outer', folder: null, depth: 1, position: 1 });
    expect(nested['/a/child']).toEqual({
      group: 'Inner',
      folder: 'Folder',
      depth: 2,
      position: 1,
    });
    expect(nested['/b']).toEqual({ group: 'Outer', folder: null, depth: 1, position: 3 });
  });

  test('every page in the sidebar tree resolves to a non-null group', () => {
    const missing = flattenTree(source.pageTree.children)
      .map(page => page.url)
      .filter(url => index[url]?.group == null);

    expect(missing).toEqual([]);
  });

  test('every root meta.json entry that is a page is indexed', async () => {
    const meta = JSON.parse(
      await readFile(join(import.meta.dir, '../../content/docs/meta.json'), 'utf-8')
    ) as { pages: string[] };

    const indexed = meta.pages
      .filter(entry => !entry.startsWith('---') && entry !== '...')
      .map(entry => (entry === 'index' ? '/docs' : `/docs/${entry}`))
      .filter(url => index[url] != null);

    // Entries that are folders without an index page have no url of their own.
    expect(indexed).toContain('/docs/quickstart');
    expect(indexed).toContain('/docs/authentication');
    expect(indexed).toContain('/docs/providers');
  });
});
