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

  test('keeps progressive authentication guides in the human and agent indexes', async () => {
    const [authentication, llmsRoute] = await Promise.all([
      read('content/docs/authentication.mdx'),
      read('app/llms.txt/route.ts'),
    ]);
    const guides = [
      'manually-authenticating',
      'managing-multiple-connected-accounts',
      'shared-connections',
      'importing-existing-connections',
      'custom-app-vs-managed-app',
      'programmatic-auth-configs',
      'controlling-scopes',
      'white-labeling-authentication',
    ];

    for (const guide of guides) {
      expect(authentication).toContain(`href="/docs/${guide}"`);
      expect(llmsRoute).toContain(`'/docs/${guide}'`);
    }
  });
});
