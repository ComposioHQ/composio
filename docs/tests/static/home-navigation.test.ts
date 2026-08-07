import { describe, expect, test } from 'bun:test';

import {
  HOME_INTENTS,
  homeIntentsToMarkdown,
  replaceHomeNavigationMarkdown,
} from '../../lib/home-navigation';
import { toCleanMarkdown } from '../../agent/lib/docs';

describe('Welcome navigation', () => {
  test('separates build paths from use paths', () => {
    expect(HOME_INTENTS.map(intent => intent.title)).toEqual([
      'Build with Composio',
      'Use Composio',
    ]);

    expect(HOME_INTENTS[0].links.map(link => link.href)).toEqual([
      '/docs/quickstart',
      '/docs/providers',
      '/docs/sessions-via-mcp',
    ]);
    expect(HOME_INTENTS[1].links.map(link => link.href)).toEqual([
      '/docs/composio-connect',
      '/docs/cli',
      '/docs/claude-code-plugin',
    ]);
  });

  test('serializes the same paths for agent-readable Markdown', () => {
    const markdown = homeIntentsToMarkdown();

    for (const intent of HOME_INTENTS) {
      expect(markdown).toContain(`### ${intent.title}`);
      for (const link of intent.links) {
        expect(markdown).toContain(`[${link.title}](${link.href})`);
      }
    }

    expect(replaceHomeNavigationMarkdown('<HomeSurfaces />')).toBe(markdown);
    expect(markdown.toLowerCase()).not.toContain('skills');
  });

  test('serializes the same paths into the docs-agent search corpus', () => {
    const markdown = toCleanMarkdown(`---
title: Welcome
---

<DocsHero />

<HomeSurfaces />`);

    expect(markdown).toContain('### Build with Composio');
    expect(markdown).toContain('### Use Composio');
    expect(markdown).toContain('[Claude Code plugin](/docs/claude-code-plugin)');
    expect(markdown).not.toContain('<HomeSurfaces />');
  });
});
