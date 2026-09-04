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
    const lockupSource = await Bun.file(
      new URL('../../components/product-lockup.tsx', import.meta.url)
    ).text();

    expect(source).toContain('id="two-ways-to-start"');
    for (const intent of HOME_INTENTS) {
      expect(homeIntentAnchor(intent.product)).toMatch(/^[a-z0-9-]+$/);
    }
    expect(source).toContain('id={homeIntentAnchor(intent.product)}');
    // Each compact card is headed by the canonical product lockup: Composio
    // logo plus the dashboard's ComposioProductBadge port.
    expect(source).toContain('ProductLockup');
    expect(source).toContain('ProductSelectionLink');
    expect(source).toContain('md:grid-cols-2');
    expect(lockupSource).toContain('ProductBadge');
    expect(lockupSource).toContain('background: PLATFORM_BADGE_GRADIENT');
    expect(lockupSource).toContain("backgroundClip: 'text'");
    expect(lockupSource).toContain("WebkitTextFillColor: 'transparent'");
    expect(lockupSource).toContain("mask: 'linear-gradient(#fff 0 0) content-box");
    expect(lockupSource).toContain('text-[#0007cd] dark:text-[#4d6fff]');
    expect(lockupSource).toContain('product-badge-platform-border');
    expect(lockupSource).toContain('/Composio Logo.svg');
    // Both logo variants carry the same alt: `dark:hidden` / `hidden dark:block`
    // swap them in CSS, so an aria-hidden dark variant would drop "Composio"
    // from the heading's accessible name in dark mode only.
    expect(lockupSource.match(/alt="Composio"/g) ?? []).toHaveLength(2);
  });

  test('offers reusable agent setup actions on the homepage and quickstart', async () => {
    const source = await Bun.file(
      new URL('../../components/agent-setup-actions.tsx', import.meta.url)
    ).text();
    const heroSource = await Bun.file(
      new URL('../../components/docs-hero-v2.tsx', import.meta.url)
    ).text();
    const quickstartSource = await Bun.file(
      new URL('../../content/docs/quickstart.mdx', import.meta.url)
    ).text();

    expect(source).toContain('export function AgentSetupActions');
    expect(source).toContain('Agent setup');
    expect(source).toContain('/docs/agent-setup');
    expect(source).not.toContain('ProductSelectionLink');
    expect(source).toContain('navigator.clipboard.writeText(SETUP_PROMPT)');
    expect(source).toContain('npx skills add ComposioHQ/composio --skill composio');
    expect(source).toContain('https://docs.composio.dev');
    expect(heroSource).toContain('<AgentSetupActions />');
    expect(quickstartSource).toContain('<AgentSetupActions');
    for (const logo of ['claude.svg', 'codex.png', 'cursor.svg']) {
      expect(source).toContain(`/images/clients/${logo}`);
      expect(await Bun.file(new URL(`../../public/images/clients/${logo}`, import.meta.url)).exists()).toBe(true);
    }
  });

  test('links every agent setup card to instructions on the Clients page', async () => {
    const grid = await Bun.file(
      new URL('../../components/agent-setup-grid.tsx', import.meta.url)
    ).text();
    const clients = await Bun.file(
      new URL('../../content/docs/agent-setup/clients.mdx', import.meta.url)
    ).text();
    const agents = [
      'claude-code',
      'openai-codex',
      'cursor',
      'github-copilot',
      'gemini-cli',
      'openclaw',
      'opencode',
      'cline',
      'grok-build',
    ];

    for (const agent of agents) {
      expect(grid).toContain(`href: '/docs/agent-setup/clients#${agent}'`);
    }
    const overview = await Bun.file(
      new URL('../../content/docs/agent-setup/index.mdx', import.meta.url)
    ).text();
    expect(overview).toContain('<AgentSetupGrid />');
    expect(clients).not.toContain('<AgentSetupGrid');
    expect(clients).toContain('title: Clients');
    expect(clients.match(/\*\*Global install\*\*/g) ?? []).toHaveLength(9);
    expect(clients.match(/\*\*Project install\*\*/g) ?? []).toHaveLength(9);
    expect(clients.match(/```bash/g) ?? []).toHaveLength(18);
    expect(clients.match(/<AgentFirstPrompt \/>/g) ?? []).toHaveLength(9);
    for (const agent of [
      'claude-code',
      'codex',
      'cursor',
      'github-copilot',
      'gemini-cli',
      'openclaw',
      'opencode',
      'cline',
      'grok',
    ]) {
      expect(clients).toContain(`--agent ${agent} --global`);
      expect(clients).toContain(`--agent ${agent}\n`);
    }
    for (const path of [
      '.claude/skills/',
      '~/.claude/skills/',
      '~/.codex/skills/',
      '~/.cursor/skills/',
      '~/.copilot/skills/',
      '~/.gemini/skills/',
      '~/.openclaw/skills/',
      '~/.config/opencode/skills/',
      '~/.agents/skills/',
      '.grok/skills/',
      '~/.grok/skills/',
    ]) {
      expect(clients).toContain(path);
    }
    for (const logo of ['opencode.svg', 'cline.svg', 'grok.svg']) {
      expect(grid).toContain(`/images/clients/${logo}`);
      expect(await Bun.file(new URL(`../../public/images/clients/${logo}`, import.meta.url)).exists()).toBe(true);
    }
    expect(clients).not.toContain('Use Composio with your own apps');
    expect(clients).not.toContain('personal apps');

    const firstPrompt = await Bun.file(
      new URL('../../components/agent-first-prompt.tsx', import.meta.url)
    ).text();
    expect(firstPrompt).toContain('navigator.clipboard.writeText(FIRST_PROMPT)');
    expect(firstPrompt).toContain('Use the $composio skill to get Composio working in this codebase.');
    expect(firstPrompt).toContain('Help me connect an integration and make my first real tool call.');
    expect(firstPrompt).toContain('When it works, show me what changed and what I can try next.');
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
