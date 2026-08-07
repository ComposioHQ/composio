import { describe, expect, test } from 'bun:test';

import {
  HOME_INTENTS,
  homeIntentsToMarkdown,
  replaceHomeNavigationMarkdown,
} from '../../lib/home-navigation';

describe('Welcome navigation', () => {
  test('separates build paths from use paths', () => {
    expect(HOME_INTENTS.map(intent => intent.title)).toEqual([
      'Build with Composio',
      'Use Composio',
    ]);
    expect(HOME_INTENTS.map(intent => intent.audience)).toEqual([
      'Platform',
      'For you',
    ]);

    expect(HOME_INTENTS[0].links.map(link => link.href)).toEqual([
      '/docs/quickstart',
      '/docs/providers',
      '/docs/sessions-via-mcp',
    ]);
    expect(HOME_INTENTS[1].links.map(link => link.href)).toEqual([
      '/docs/agent-plugins',
      '/docs/cli',
      '/docs/composio-connect',
    ]);
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
    expect(markdown).not.toContain('<HomeSurfaces');
    expect(markdown.toLowerCase()).not.toContain('skills');
    expect(markdown).toContain('native Composio plugin for Codex or Claude Code');
  });

  test('uses the dashboard product badge treatments', async () => {
    const source = await Bun.file(
      new URL('../../components/home-surfaces.tsx', import.meta.url)
    ).text();

    expect(source).toContain("audience === 'Platform'");
    expect(source).toContain('backgroundImage: PLATFORM_BADGE_GRADIENT');
    expect(source).toContain("backgroundClip: 'text'");
    expect(source).toContain("WebkitBackgroundClip: 'text'");
    expect(source).toContain("WebkitTextFillColor: 'transparent'");
    expect(source).toContain('text-[var(--composio-brand)]');
  });
});
