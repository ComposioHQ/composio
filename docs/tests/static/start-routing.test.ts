import { describe, expect, test } from 'bun:test';

import { HOME_INTENTS } from '../../lib/home-navigation';

const read = (path: string) => Bun.file(new URL(`../../${path}`, import.meta.url)).text();

describe('getting-started routing policy', () => {
  test('publishes native plugins for both supported agent hosts', async () => {
    const plugins = await read('content/docs/agent-plugins.mdx');

    expect(plugins).toContain('Agent plugins let Codex and Claude Code use Composio');
    expect(plugins).toContain('composio setup --target codex');
    expect(plugins).toContain('composio setup --target claude');
    expect(plugins).toContain('codex plugin marketplace add');
    expect(plugins).toContain('/plugin marketplace add');
    expect(plugins).toContain('composio search');
    expect(plugins).toContain('composio link');
    expect(plugins).toContain('composio execute');
    expect(plugins).toContain('composio --install-skill composio-cli claude');
    expect(plugins).toContain('composio --install-skill composio-cli codex');
    expect(plugins).toContain('composio setup --target auto --yes');
    expect(plugins).toContain('### Codex');
    expect(plugins).toContain('### Claude Code');
    expect(plugins).not.toContain('<Tabs');
  });

  test('keeps native plugins ahead of CLI and explicit MCP on Welcome', () => {
    expect(HOME_INTENTS[1].links.map(link => link.href)).toEqual([
      '/docs/agent-plugins',
      '/docs/cli',
      '/docs/composio-connect',
    ]);
  });

  test('keeps progressive authentication guides in the human hub and the sidebar', async () => {
    const [authentication, authMeta, sessionsMeta] = await Promise.all([
      read('content/docs/authentication/index.mdx'),
      read('content/docs/authentication/meta.json'),
      read('content/docs/extending-sessions/meta.json'),
    ]);
    const authGuides = [
      'manually-authenticating',
      'managing-multiple-connected-accounts',
      'importing-existing-connections',
      'custom-app-vs-managed-app',
      'programmatic-auth-configs',
      'controlling-scopes',
      'white-labeling-authentication',
    ];
    const authPages = JSON.parse(authMeta).pages as string[];
    const sessionPages = JSON.parse(sessionsMeta).pages as string[];

    for (const guide of authGuides) {
      expect(authentication).toContain(`href="/docs/authentication/${guide}"`);
      expect(authPages).toContain(guide);
    }

    expect(authentication).toContain('href="/docs/extending-sessions/shared-connections"');
    expect(sessionPages).toContain('shared-connections');
  });
});
