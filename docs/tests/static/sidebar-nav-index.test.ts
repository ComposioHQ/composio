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
      position: expect.any(Number),
    });

    expect(index['/docs/extending-sessions/shared-connections']).toEqual({
      group: 'Guides',
      folder: 'Extend sessions',
      depth: 2,
      position: expect.any(Number),
    });
  });

  test('top-level pages have no folder', () => {
    expect(index['/docs/quickstart']).toEqual({
      group: 'Get Started',
      folder: null,
      depth: 1,
      position: expect.any(Number),
    });
  });

  test('folder index pages resolve to the folder row', () => {
    expect(index['/docs/authentication']).toEqual({
      group: 'Core concepts',
      folder: 'Authentication',
      depth: 1,
      position: expect.any(Number),
    });
  });

  test('position increases down a group and resets at the next separator', () => {
    expect(index['/docs/quickstart'].position).toBeGreaterThan(index['/docs'].position);
    expect(index['/docs/how-composio-works'].position).toBe(1);
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
