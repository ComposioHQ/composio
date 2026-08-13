import { describe, expect, test } from 'bun:test';

import {
  HOME_INTENTS,
  homeIntentAnchor,
  homeIntentsToMarkdown,
  replaceHomeNavigationMarkdown,
} from '../../lib/home-navigation';
import { mdxToCleanMarkdown } from '../../lib/source';

describe('Welcome navigation', () => {
  test('separates build paths from use paths', () => {
    expect(HOME_INTENTS.map(intent => intent.title)).toEqual([
      'Build with Composio',
      'Composio For You',
    ]);
    expect(HOME_INTENTS[0].links.map(link => link.href)).toEqual([
      '/docs/quickstart',
      '/docs/providers',
      '/docs/sessions-via-mcp',
    ]);
    expect(HOME_INTENTS[1].links.map(link => link.href)).toEqual([
      '/docs/agent-plugins',
      '/docs/cli',
      'https://composio.dev/for-you',
    ]);
  });

  test('sends MCP-client setup off-site and keeps the old product name gone', () => {
    // Only the MCP-client half of Composio For You lives on composio.dev; the
    // plugin and CLI pages are documented here.
    expect(HOME_INTENTS[1].links.filter(link => link.external)).toHaveLength(1);
    expect(HOME_INTENTS[1].links.at(-1)?.external).toBe(true);

    const markdown = homeIntentsToMarkdown();
    expect(markdown).not.toContain('/docs/composio-connect');
    expect(markdown).not.toContain('Composio Connect');
  });

  test('serializes the same paths for agent-readable Markdown', () => {
    const markdown = homeIntentsToMarkdown();

    for (const intent of HOME_INTENTS) {
      expect(markdown).toContain(`### ${intent.title}`);
      expect(markdown).toContain(`**${intent.audience}**`);
      for (const link of intent.links) {
        expect(markdown).toContain(`[${link.title}](${link.href})`);
      }
    }

    expect(replaceHomeNavigationMarkdown('<HomeSurfaces />')).toBe(markdown);
    expect(mdxToCleanMarkdown('<HomeSurfaces />')).toContain('## Two ways to start');
    expect(mdxToCleanMarkdown('<HomeSurfaces />')).toContain('### Build with Composio');
    expect(markdown).not.toContain('<HomeSurfaces');
    expect(markdown.toLowerCase()).not.toContain('skills');
    expect(markdown).toContain('native Composio plugin for Codex or Claude Code');
    expect(markdown).toContain('](https://composio.dev/for-you)');
  });

  test('keeps rendered headings linkable and badges visible', async () => {
    const source = await Bun.file(
      new URL('../../components/home-surfaces.tsx', import.meta.url)
    ).text();

    expect(source).toContain('id="two-ways-to-start"');
    for (const intent of HOME_INTENTS) {
      expect(homeIntentAnchor(intent.title)).toMatch(/^[a-z0-9-]+$/);
    }
    expect(source).toContain('id={homeIntentAnchor(intent.title)}');
    expect(source).toContain('background: PLATFORM_BADGE_GRADIENT');
    expect(source).toContain("backgroundClip: 'text'");
    expect(source).toContain("WebkitTextFillColor: 'transparent'");
    expect(source).toContain("mask: 'linear-gradient(#fff 0 0) content-box");
    expect(source).toContain('text-[#0007cd] dark:text-[#4d6fff]');
    expect(source).toContain('audience-badge-platform-border');
  });
});
