import { describe, expect, test } from 'bun:test';

import { HOME_INTENTS } from '../../lib/home-navigation';
import { SESSION_GUARDRAILS } from '../../lib/llm-guardrails/session';

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
    expect(plugins).not.toContain('sidebar: false');
  });

  test('keeps native plugins ahead of CLI and explicit MCP on Welcome', () => {
    expect(HOME_INTENTS[1].links.map(link => link.href)).toEqual([
      '/docs/agent-plugins',
      '/docs/cli',
      '/docs/composio-connect',
    ]);
  });

  test('keeps the same routing boundary in agent-readable sources', async () => {
    const sources = await Promise.all([
      read('agent/instructions/context.md'),
      read('agent/knowledge.md'),
      read('app/llms.txt/route.ts'),
    ]);

    for (const source of sources) {
      expect(source).toContain('/docs/agent-plugins');
      expect(source).toContain('/docs/composio-connect');
      expect(source).toContain('/docs/sessions-via-mcp');
    }

    expect(SESSION_GUARDRAILS).toContain('/docs/agent-plugins');
    expect(SESSION_GUARDRAILS).toContain('/docs/composio-connect');
    expect(SESSION_GUARDRAILS).toContain('/docs/sessions-via-mcp');
  });
});
