import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import GithubSlugger from 'github-slugger';
import { flattenTree } from 'fumadocs-core/page-tree';
import { source } from '../../lib/source';
import { buildProductPageTree } from '../../lib/product-page-tree';

const content = join(import.meta.dir, '../../content/docs');
const expectedPages = [
  ['Create and reuse', '/docs/sessions/create-and-reuse'],
  ['Restrict tool access', '/docs/sessions/tool-access'],
  ['Saved session policies', '/docs/sessions/saved-session-policies'],
  ['Load tools', '/docs/sessions/loading-tools'],
  ['Select connections', '/docs/sessions/connections'],
  ['Set sandbox options', '/docs/sessions/sandbox-settings'],
  ['Update a session', '/docs/sessions/updating-sessions'],
  ['Execute session tools', '/docs/sessions/executing-tools'],
  ['Tool execution hooks', '/docs/sessions/hooks'],
];

// Public bookmarks from the two pages split in November 2026.
const bookmarks: Record<string, string> = {
  '/docs/configuring-sessions#creating-a-session':
    '/docs/sessions/create-and-reuse#creating-a-session',
  '/docs/configuring-sessions#api-key-permissions':
    '/docs/sessions/create-and-reuse#api-key-permissions',
  '/docs/configuring-sessions#using-a-saved-session-config':
    '/docs/sessions/tool-access#using-a-saved-session-config',
  '/docs/configuring-sessions#reading-and-updating-session-configuration':
    '/docs/sessions/updating-sessions#reading-and-updating-session-configuration',
  '/docs/configuring-sessions#requiring-tool-approval':
    '/docs/sessions/tool-access#requiring-tool-approval',
  '/docs/configuring-sessions#enabling-toolkits': '/docs/sessions/tool-access#enabling-toolkits',
  '/docs/configuring-sessions#disabling-toolkits': '/docs/sessions/tool-access#disabling-toolkits',
  '/docs/configuring-sessions#denying-every-app-toolkit':
    '/docs/sessions/tool-access#denying-every-app-toolkit',
  '/docs/configuring-sessions#direct-tools-preset':
    '/docs/sessions/loading-tools#direct-tools-preset',
  '/docs/configuring-sessions#enable-selected-meta-tools':
    '/docs/sessions/loading-tools#enable-selected-meta-tools',
  '/docs/configuring-sessions#enabling-or-disabling-specific-tools':
    '/docs/sessions/tool-access#enabling-or-disabling-specific-tools',
  '/docs/configuring-sessions#filtering-tools-by-tags':
    '/docs/sessions/tool-access#filtering-tools-by-tags',
  '/docs/configuring-sessions#overriding-for-a-toolkit':
    '/docs/sessions/tool-access#overriding-for-a-toolkit',
  '/docs/configuring-sessions#preloading-tools': '/docs/sessions/loading-tools#preloading-tools',
  '/docs/configuring-sessions#custom-auth-configs':
    '/docs/sessions/connections#custom-auth-configs',
  '/docs/configuring-sessions#account-selection': '/docs/sessions/connections#account-selection',
  '/docs/configuring-sessions#precedence': '/docs/sessions/connections#precedence',
  '/docs/configuring-sessions#disabling-the-sandbox':
    '/docs/sessions/sandbox-settings#disabling-the-sandbox',
  '/docs/configuring-sessions#sandbox-compute-tier':
    '/docs/sessions/sandbox-settings#sandbox-compute-tier',
  '/docs/configuring-sessions#updating-a-session':
    '/docs/sessions/updating-sessions#updating-a-session',
  '/docs/configuring-sessions#maps-replace-they-dont-merge':
    '/docs/sessions/updating-sessions#maps-replace-they-dont-merge',
  '/docs/configuring-sessions#narrowing-an-existing-session-to-no-app-toolkits':
    '/docs/sessions/updating-sessions#narrowing-an-existing-session-to-no-app-toolkits',
  '/docs/configuring-sessions#removing-a-callback-url':
    '/docs/sessions/updating-sessions#removing-a-callback-url',
  '/docs/configuring-sessions#clearing-a-block-with-null':
    '/docs/sessions/updating-sessions#clearing-a-block-with-null',
  '/docs/configuring-sessions#blocks-you-can-set-only-on-update':
    '/docs/sessions/updating-sessions#blocks-you-can-set-only-on-update',
  '/docs/configuring-sessions#multi-account-mode-after-an-update':
    '/docs/sessions/updating-sessions#multi-account-mode-after-an-update',
  '/docs/configuring-sessions#preload-must-stay-inside-the-policy':
    '/docs/sessions/updating-sessions#preload-must-stay-inside-the-policy',
  '/docs/configuring-sessions#concurrent-updates':
    '/docs/sessions/updating-sessions#concurrent-updates',
  '/docs/configuring-sessions#session-methods': '/docs/sessions/loading-tools#tools',
  '/docs/configuring-sessions#tools': '/docs/sessions/loading-tools#tools',
  '/docs/configuring-sessions#executemeta--execute_meta':
    '/docs/sessions/executing-tools#executemeta--execute_meta',
  '/docs/configuring-sessions#authorize': '/docs/sessions/connections#authorize',
  '/docs/configuring-sessions#toolkits': '/docs/sessions/connections#toolkits',
  '/docs/configuring-sessions#update': '/docs/sessions/updating-sessions#update',
  '/docs/configuring-sessions#configuration-history':
    '/docs/sessions/updating-sessions#configuration-history',
  '/docs/configuring-sessions#delete': '/docs/sessions/create-and-reuse#delete',
  '/docs/configuring-sessions#browsing-the-catalog':
    '/docs/sessions/tool-access#browsing-the-catalog',
  '/docs/configuring-sessions#next': '/docs/sessions/sandbox-settings#next',
  '/docs/how-composio-works#the-basics': '/docs/sessions/create-and-reuse#the-basics',
  '/docs/how-composio-works#what-comes-in-a-session': '/docs/sessions#what-comes-in-a-session',
  '/docs/how-composio-works#users': '/docs/sessions#users',
  '/docs/how-composio-works#authentication': '/docs/sessions#authentication',
  '/docs/how-composio-works#tools-and-toolkits': '/docs/sessions#tools-and-toolkits',
  '/docs/how-composio-works#meta-tools': '/docs/sessions#meta-tools',
  '/docs/how-composio-works#executing-session-tools':
    '/docs/sessions/executing-tools#executing-session-tools',
  '/docs/how-composio-works#reading-execution-results':
    '/docs/sessions/executing-tools#reading-execution-results',
  '/docs/how-composio-works#handling-requests-for-user-input':
    '/docs/sessions/executing-tools#handling-requests-for-user-input',
  '/docs/how-composio-works#sandbox': '/docs/sessions#sandbox',
  '/docs/how-composio-works#how-sessions-behave':
    '/docs/sessions/create-and-reuse#how-sessions-behave',
  '/docs/how-composio-works#next': '/docs/sessions#next',
};

function readPage(url: string): string {
  const slug = url.replace('/docs/', '');
  return readFileSync(
    join(content, slug === 'sessions' ? 'sessions/index.mdx' : `${slug}.mdx`),
    'utf8'
  );
}

function anchors(text: string): string[] {
  const slugger = new GithubSlugger();
  let fenced = false;
  const headings = text.split('\n').flatMap(line => {
    if (line.startsWith('```')) fenced = !fenced;
    const heading = !fenced && line.match(/^#{1,6} (.+)$/);
    return heading ? [slugger.slug(heading[1])] : [];
  });
  return [...headings, ...Array.from(text.matchAll(/<span id="([^"]+)"/g), match => match[1])];
}

describe('Sessions task pages', () => {
  test('the overview retains its task directory and section bookmarks', () => {
    const overview = readPage('/docs/sessions');
    expect(overview.match(/^## .+$/gm)).toContain('## Choose a task');
    for (const [hash, destination] of Object.entries({
      'what-comes-in-a-session': '/docs/sessions/create-and-reuse#what-comes-in-a-session',
      users: '/docs/sessions/create-and-reuse#users',
      authentication: '/docs/sessions/connections#authentication',
      'tools-and-toolkits': '/docs/sessions/tool-access#tools-and-toolkits',
      'meta-tools': '/docs/sessions/loading-tools#meta-tools',
      sandbox: '/docs/sessions/sandbox-settings#sandbox',
    })) {
      const [path, section] = destination.split('#');
      expect(anchors(overview)).toContain(hash);
      expect(overview).toContain(`](${path})`);
      expect(anchors(readPage(path))).toContain(section);
    }
  });

  test('the canonical folder route is not shadowed by a legacy redirect', () => {
    const config = readFileSync(join(import.meta.dir, '../../next.config.mjs'), 'utf8');
    expect(config).not.toMatch(/source:\s*['"]\/docs\/sessions['"]/);
  });

  test('both sidebars link the Sessions header to the overview with nine task children', () => {
    for (const tree of [source.pageTree, buildProductPageTree(source.pageTree, 'platform')]) {
      const folder = tree.children.find(node => node.type === 'folder' && node.name === 'Sessions');
      expect(folder?.type).toBe('folder');
      if (folder?.type !== 'folder') throw new Error('Sessions folder is missing');
      expect(folder.index?.url).toBe('/docs/sessions');
      expect(readPage('/docs/sessions').match(/^title: (.+)$/m)?.[1]).toBe('Sessions overview');
      expect(folder.children.every(node => node.type === 'page')).toBe(true);
      expect(folder.children.map(node => (node.type === 'page' ? node.url : null))).toEqual(
        expectedPages.map(([, url]) => url)
      );
      // Bun's MDX test loader uses filename fallbacks for page names.
      // Production compilation reads these frontmatter titles.
      for (const [title, url] of expectedPages) {
        expect(readPage(url).match(/^title: (.+)$/m)?.[1]).toBe(title);
        expect(readPage('/docs/sessions')).toContain(`[${title}](${url})`);
      }
      const urls = flattenTree(tree.children).map(page => page.url);
      expect(urls).not.toContain('/docs/configuring-sessions');
      expect(urls).not.toContain('/docs/how-composio-works');
      expect(urls).not.toContain('/docs/session-configs');
      expect(urls).toContain('/docs/sessions-via-mcp');
      expect(urls).toContain('/docs/extending-sessions/local-tools-and-toolkits');
    }
  });

  test.each(Object.entries(bookmarks))(
    'preserves %s with a working destination',
    (oldUrl, destination) => {
      const [oldPath, oldHash] = oldUrl.split('#');
      const [newPath, newHash] = destination.split('#');
      const oldContent = readPage(oldPath);
      expect(anchors(oldContent)).toContain(oldHash);
      expect(oldContent).toContain(`](${destination})`);
      expect(anchors(readPage(newPath))).toContain(newHash);
    }
  );
});
