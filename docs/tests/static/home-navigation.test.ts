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
    expect(source).toContain("backgroundClip: 'text'");
    expect(source).toContain("WebkitTextFillColor: 'transparent'");
    expect(source).toContain("mask: 'linear-gradient(#fff 0 0) content-box");
    expect(source).toContain('text-[#0007cd] dark:text-[#4d6fff]');
    expect(source).toContain('product-badge-platform-border');
    expect(source).toContain('/Composio Logo.svg');
    // Both logo variants carry the same alt: `dark:hidden` / `hidden dark:block`
    // swap them in CSS, so an aria-hidden dark variant would drop "Composio"
    // from the heading's accessible name in dark mode only.
    expect(source.match(/alt="Composio"/g) ?? []).toHaveLength(2);
    expect(source).toContain('INTENT_VISUALS');
    expect(source).toContain('How can I help?');
    expect(source).toContain('composio.create');
    for (const logo of ['claude.svg', 'codex.png', 'cursor.svg', 'openclaw.svg']) {
      expect(source).toContain(`/images/clients/${logo}`);
      expect(await Bun.file(new URL(`../../public/images/clients/${logo}`, import.meta.url)).exists()).toBe(true);
    }
  });

  test('advertises only toolkits that exist in the catalog', async () => {
    const source = await Bun.file(
      new URL('../../components/home-features.tsx', import.meta.url)
    ).text();
    const block = source.match(/const TOOLKIT_LOGOS = \[([\s\S]*?)\]/)?.[1];
    expect(block).toBeTruthy();
    const slugs = [...block!.matchAll(/'([a-z0-9]+)'/g)].map(m => m[1]);
    expect(slugs.length).toBe(29);

    const catalog: { slug: string }[] = await Bun.file(
      new URL('../../public/data/toolkits.json', import.meta.url)
    ).json();
    const known = new Set(catalog.map(t => t.slug));
    // A tile that isn't in the catalog still renders (the logo CDN serves it)
    // but advertises an app with no /toolkits/<slug> page behind it.
    expect(slugs.filter(s => !known.has(s))).toEqual([]);
  });

  test('keeps the auth diagram wires drawable at every pane width', async () => {
    const source = await Bun.file(
      new URL('../../components/home-auth-diagram.tsx', import.meta.url)
    ).text();

    // The feature-grid pane is not monotonic in the viewport: ~404px at 1280px
    // but only ~242px at 640px, where the grid goes two-column. Fixed hub/card
    // widths that fit one end overflow the other, the horizontal run goes to
    // zero, and every elbow degenerates into elbowPath's straight-line
    // fallback — the middle wire to a zero-length, invisible path. Proportional
    // widths keep a gap at every size; container queries gate the account label
    // on the pane rather than the viewport.
    expect(source).toContain('w-[36%] max-w-36');
    expect(source).toContain('w-[52%] max-w-56');
    expect(source).toContain('@container');
    expect(source).toContain('@[340px]:inline');
    expect(source).not.toMatch(/className="[^"]*\bw-44\b/);

    // Stale paths outlive a resize when RO delivery is throttled, so the
    // window listener backs it up (as in connection-refresh-visual.tsx).
    expect(source).toContain("window.addEventListener('resize', calc)");
    expect(source).toContain("window.removeEventListener('resize', calc)");
  });

  test('shows the sandbox on its real Python surface', async () => {
    const source = await Bun.file(
      new URL('../../components/home-features.tsx', import.meta.url)
    ).text();

    // content/docs/sandbox/remote.mdx — where this card links — describes a
    // persistent Python environment with run_composio_tool / invoke_llm
    // pre-initialized. There is no composio.sandbox.run() SDK method.
    expect(source).toContain('run_composio_tool');
    expect(source).toContain('invoke_llm');
    expect(source).toContain('sandbox.py');
    expect(source).not.toContain('composio.sandbox.run');
    expect(source).not.toContain('composio.workbench.run');
  });
});
