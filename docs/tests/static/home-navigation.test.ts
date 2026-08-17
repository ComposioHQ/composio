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
      'Use Composio',
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
      expect(markdown).toContain(`**${intent.product}**`);
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
  });

  test('keeps rendered headings linkable and product visuals present', async () => {
    const source = await Bun.file(
      new URL('../../components/home-surfaces.tsx', import.meta.url)
    ).text();

    expect(source).toContain('id="two-ways-to-start"');
    for (const intent of HOME_INTENTS) {
      expect(homeIntentAnchor(intent.product)).toMatch(/^[a-z0-9-]+$/);
    }
    expect(source).toContain('id={homeIntentAnchor(intent.product)}');
    // Each card is headed by the canonical product lockup — Composio logo
    // plus the dashboard's ComposioProductBadge port — and leads with the
    // same mock the dashboard onboarding path step uses for that product: an
    // agent chat composer plus client logos for For You, the SDK in a code
    // window for Platform.
    expect(source).toContain('ProductBadge');
    expect(source).toContain('background: PLATFORM_BADGE_GRADIENT');
    expect(source).toContain('text-[#0007cd] dark:text-[#4d6fff]');
    expect(source).toContain('product-badge-platform-border');
    expect(source).toContain('/Composio Logo.svg');
    expect(source).toContain('INTENT_VISUALS');
    expect(source).toContain('How can I help?');
    expect(source).toContain('composio.create');
    for (const logo of ['claude.svg', 'codex.png', 'cursor.svg', 'openclaw.svg']) {
      expect(source).toContain(`/images/clients/${logo}`);
      expect(await Bun.file(new URL(`../../public/images/clients/${logo}`, import.meta.url)).exists()).toBe(true);
    }
  });
});
