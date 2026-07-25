import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { generateKbContent } from '@/lib/kb/generate';
import { buildKbCatalog } from '@/lib/kb/catalog';
import { createKbArticleReader, getKbCatalog } from '@/lib/kb/repository';
import type { KbManifest } from '@/lib/kb/types';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function listFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
}

describe('public KB content generation', () => {
  test('defines multi-source provenance in the KB frontmatter schema', () => {
    const sourceConfig = readFileSync(join(process.cwd(), 'source.config.ts'), 'utf8');

    expect(sourceConfig).toMatch(/sources:\s*z\s*\.\s*array\(/);
    expect(sourceConfig).toContain('sourcePath: z.string(),');
    expect(sourceConfig).toContain('sourceHeading: z.string().nullable(),');
    expect(sourceConfig).not.toContain('sourcePath: z.string().optional()');
    expect(sourceConfig).not.toContain('sourceHeading: z.string().optional()');
  });

  test('generates native Fumadocs pages for published guides only', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);

    const summary = generateKbContent({ outputDir });
    const files = listFiles(outputDir);

    // Counts track the manifest rather than a fixed seed size: every published
    // guide gets one page, plus index.mdx, meta.json, and guide/meta.json.
    const guides = getKbCatalog().manifest.guides;
    const publishedCount = guides.filter(guide => guide.state === 'published').length;
    const heldCount = guides.filter(guide => guide.state === 'needs-review').length;

    expect(summary).toEqual({
      published: publishedCount,
      held: heldCount,
      files: files.length,
    });
    expect(files).toHaveLength(publishedCount + 3);
    expect(files).toContain('index.mdx');
    expect(files).toContain('meta.json');
    expect(files).toContain('guide/meta.json');
    expect(files).toContain('guide/use-tool-router-session-files-as-tool-inputs.mdx');
    expect(files).toContain('guide/pagination-limits-are-endpoint-specific.mdx');
    expect(files).toContain('guide/deduplicate-trigger-webhook-deliveries.mdx');
    expect(files).toContain('guide/custom-connection-data-fields-are-toolkit-specific.mdx');
    expect(files).toContain('guide/ahrefs-actions-use-the-api-host.mdx');
    expect(files).toContain('guide/use-calendly-post-invitee.mdx');
    expect(files).toContain('guide/use-canva-autofill-jobs-for-design-content.mdx');
    expect(files).toContain('guide/granola-mcp-metadata-comes-from-the-upstream-server.mdx');
    expect(files).toContain('guide/inspect-odoo-json-rpc-errors-inside-http-200-responses.mdx');
    expect(files).toContain('guide/strava-athlete-limits-belong-to-the-oauth-app.mdx');
    expect(files).toContain('guide/fix-hubspot-oauth-token-exchange-400-client-secret-and-scopes.mdx');
    expect(files).toContain('guide/choose-current-shopify-app-auth-flow.mdx');
    expect(files).toContain('guide/choose-discordbot-for-bot-token-operations.mdx');
    expect(files).toContain('guide/target-outlook-shared-mailboxes-by-address.mdx');
    expect(files).toContain('guide/google-sheets-oauth-cannot-be-scoped-to-a-drive-folder.mdx');
    expect(files).toContain('guide/use-primary-for-google-calendar-id.mdx');
    expect(files).toContain('guide/google-sheets-auth-configs-require-full-scope-uris.mdx');
    expect(files).toContain('guide/stripe-api-key-connections-require-a-secret-key.mdx');
    expect(files).toContain('guide/snowflake-account-id-uses-org-account-format.mdx');
    expect(files).toContain('guide/stage-local-instagram-media-before-publishing.mdx');
    expect(files).toContain('guide/resolve-canvas-account-endpoint-access-errors.mdx');
    expect(files).toContain('guide/paginate-canvas-list-results.mdx');
    expect(files).toContain('guide/slack-private-conversations-require-separate-history-scopes.mdx');
    expect(files).toContain('guide/slack-admin-conversation-writes-require-enterprise.mdx');
    expect(files).toContain('guide/linkedin-company-actions-require-organization-scopes.mdx');
    expect(files).toContain('guide/fix-linkedin-426-nonexistent-version.mdx');
    expect(files).toContain('guide/batch-airtable-record-updates-in-groups-of-10.mdx');
    expect(files.some(file => file.startsWith('toolkits/'))).toBe(false);
    expect(files.some(file => file.startsWith('sdk-and-api/'))).toBe(false);
    expect(files.some(file => file.includes('auth-config-list-pages'))).toBe(false);

    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'kb/manifest.json'), 'utf8'),
    ) as KbManifest;
    const published = manifest.guides.filter(guide => guide.state === 'published');
    const newlyAuthored = published.filter(guide => guide.articlePath !== undefined);
    const held = manifest.guides.filter(guide => guide.state === 'needs-review');
    expect(published).toHaveLength(publishedCount);
    // Every published guide renders from an authored article, never from the
    // source snapshot. That keeps kb/source a verbatim copy of upstream, so it
    // stays comparable for drift detection instead of drifting under editing.
    expect(newlyAuthored).toHaveLength(published.length);
    expect(new Set(newlyAuthored.map(guide => guide.articlePath)).size).toBe(published.length);
    expect(new Set(newlyAuthored.map(guide => `/kb/guide/${guide.slug}`)).size).toBe(
      published.length
    );
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({
      slug: 'auth-config-list-pages-return-at-most-50-items',
      lastVerifiedAt: null,
      reviewAfter: null,
    });
    expect(held[0]?.articlePath).toBeUndefined();

    // Caps how far one toolkit can dominate the corpus. Platform, MCP, and SDK
    // guides have no toolkit source and are outside this cap by construction.
    //
    // The cap scales with the corpus instead of sitting at a fixed 3. Publishing
    // is ranked by support demand, and demand is concentrated — QuickBooks alone
    // was 25 of 171 threads in the 2026-07-24 window. A fixed cap set when the
    // corpus held 27 guides would force the highest-demand clusters to stay
    // under-covered as the corpus grows. Ten percent still stops any one toolkit
    // from taking over the KB.
    const toolkitCounts = new Map<string, number>();
    for (const guide of newlyAuthored) {
      const toolkit = guide.sources
        .map(source => source.sourcePath.match(/^kb\/toolkits\/([^/]+)\/public\.md$/)?.[1])
        .find((slug): slug is string => slug !== undefined);
      if (!toolkit) continue;
      toolkitCounts.set(toolkit, (toolkitCounts.get(toolkit) ?? 0) + 1);
    }
    const dominanceCap = Math.max(3, Math.floor(published.length * 0.1));
    expect(toolkitCounts.size).toBeGreaterThan(0);
    expect([...toolkitCounts.values()].every(count => count <= dominanceCap)).toBe(true);

    expect(JSON.parse(readFileSync(join(outputDir, 'meta.json'), 'utf8'))).toEqual({
      title: 'Knowledge Base',
      root: true,
      pages: ['index', 'guide'],
    });
    // Nav order is the manifest's published order, so it stays correct as
    // batches are appended rather than needing a re-listing on every publish.
    // Page order mirrors published manifest order rather than a frozen list, so
    // adding a guide does not require restating the whole corpus here.
    expect(JSON.parse(readFileSync(join(outputDir, 'guide/meta.json'), 'utf8'))).toEqual({
      title: 'Guides',
      pages: published.map(guide => guide.slug),
    });

    const guide = readFileSync(
      join(outputDir, 'guide/pagination-limits-are-endpoint-specific.mdx'),
      'utf8'
    );
    // Provenance is read from the manifest: the upstream repository and commit
    // move when the canonical source is republished, and pinning a literal here
    // turns every legitimate repin into a test failure.
    expect(guide).toContain(`sourceCommit: "${getKbCatalog().manifest.source.commit}"`);
    expect(guide).toContain(
      'sources: [{"sourcePath":"kb/platform/pagination/public.md","sourceHeading":"Pagination limits are endpoint-specific"}]'
    );
    expect(guide).not.toContain('sourcePath:');
    expect(guide).not.toContain('sourceHeading:');
    expect(guide).not.toContain('articlePath:');
    // Freshness dates come from the manifest: they are staggered and re-staggered
    // as the corpus grows, so pinning literals here just breaks on churn.
    const pagination = published.find(
      candidate => candidate.slug === 'pagination-limits-are-endpoint-specific'
    );
    expect(pagination?.lastVerifiedAt).toBeTruthy();
    expect(guide).toContain(`lastVerifiedAt: "${pagination?.lastVerifiedAt}"`);
    // Emitted, but not pinned to a literal date — review dates are restaggered
    // across the corpus whenever a batch lands.
    expect(guide).toMatch(/reviewAfter: "\d{4}-\d{2}-\d{2}"/);
    expect(guide).toContain(
      'related:\n  - title: "Use Tool Router session files as toolkit inputs"'
    );
    expect(guide).not.toContain('related: [{');

    const ahrefsGuide = readFileSync(
      join(outputDir, 'guide/ahrefs-actions-use-the-api-host.mdx'),
      'utf8'
    );
    const ahrefs = published.find(
      candidate => candidate.slug === 'ahrefs-actions-use-the-api-host'
    );
    expect(ahrefs?.lastVerifiedAt).toBeTruthy();
    expect(ahrefsGuide).toContain(`lastVerifiedAt: "${ahrefs?.lastVerifiedAt}"`);
    expect(ahrefsGuide).toMatch(/reviewAfter: "\d{4}-\d{2}-\d{2}"/);
    expect(ahrefsGuide).not.toContain('route the case to a human');
  });

  test('renders an editorial body read from a temporary articles root without exposing its path', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);
    const root = mkdtempSync(join(tmpdir(), 'composio-kb-articles-'));
    temporaryDirectories.push(root);
    const articlesRoot = join(root, 'articles');
    mkdirSync(articlesRoot);
    writeFileSync(
      join(articlesRoot, 'editorial-guide.md'),
      'This is the authored editorial body.',
      'utf8'
    );
    const manifest: KbManifest = {
      schemaVersion: 2,
      source: {
        repository: 'ComposioHQ/support-workflows',
        commit: '5eed614',
        capturedAt: '2026-07-21',
      },
      topics: [
        { slug: 'platform', title: 'Platform', description: 'Platform guidance.', featuredRank: 1 },
      ],
      guides: [
        {
          slug: 'editorial-guide',
          title: 'Editorial guide',
          description: 'A guide with an authored body.',
          articlePath: 'editorial-guide.md',
          sources: [
            { sourcePath: 'kb/platform/example/public.md', sourceHeading: 'Stable answer' },
          ],
          topics: ['platform'],
          tags: [],
          aliases: [],
          relatedGuides: [],
          externalResources: [],
          updatedAt: '2026-07-20',
          lastVerifiedAt: '2026-07-21',
          reviewAfter: '2027-01-17',
          freshness: 'evergreen',
          state: 'published',
          featured: false,
        },
      ],
    };
    const source = `---\ntype: reference\ntitle: Example\ndescription: Public example.\ncategory: platform/example\nvisibility: public\ntimestamp: 2026-07-20T00:00:00Z\ntags:\n  - example\n---\n# Example\n\n## Stable answer\n\nPublic source provenance.\n`;
    const catalog = buildKbCatalog(
      manifest,
      () => source,
      new Date('2026-07-21'),
      createKbArticleReader(articlesRoot)
    );
    generateKbContent({ outputDir, catalog });

    const generated = readFileSync(join(outputDir, 'guide/editorial-guide.mdx'), 'utf8');
    expect(generated).toContain('This is the authored editorial body.');
    expect(generated).toContain(
      'sources: [{"sourcePath":"kb/platform/example/public.md","sourceHeading":"Stable answer"}]'
    );
    expect(generated).not.toContain('articlePath');
  });

  test('publishes the narrowed Stripe guidance and toolkit-specific Discord references', () => {
    const stripe = readFileSync(
      join(process.cwd(), 'content/kb/guide/stripe-api-key-connections-require-a-secret-key.mdx'),
      'utf8',
    );
    const discord = readFileSync(
      join(process.cwd(), 'content/kb/guide/choose-discordbot-for-bot-token-operations.mdx'),
      'utf8',
    );

    expect(stripe).toContain('`sk_test_`');
    expect(stripe).toContain('`sk_live_`');
    expect(stripe).not.toContain('Stripe Connect');
    expect(discord).toContain('](/toolkits/discord)');
    expect(discord).toContain('](/toolkits/discordbot)');
  });

  test('publishes the eight verified toolkit answers with authored current guidance', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'kb/manifest.json'), 'utf8'),
    ) as KbManifest;
    const expected = [
      ['stage-local-instagram-media-before-publishing', 'Instagram', 'uploadable-file'],
      ['resolve-canvas-account-endpoint-access-errors', 'Canvas', 'account-level'],
      ['paginate-canvas-list-results', 'Canvas', 'per_page'],
      ['slack-private-conversations-require-separate-history-scopes', 'Slack', 'membership'],
      ['slack-admin-conversation-writes-require-enterprise', 'Slack', 'Enterprise'],
      ['linkedin-company-actions-require-organization-scopes', 'LinkedIn', 'Page role'],
      ['fix-linkedin-426-nonexistent-version', 'LinkedIn', 'dated version'],
      ['batch-airtable-record-updates-in-groups-of-10', 'Airtable', 'not atomic'],
    ] as const;

    for (const [slug, provider, narrowing] of expected) {
      const guide = manifest.guides.find(candidate => candidate.slug === slug);
      expect(guide).toBeDefined();
      expect(guide?.articlePath).toBe(`${slug}.md`);
      expect(guide?.sources).toHaveLength(1);
      expect(guide?.freshness).toBe('time-sensitive');
      expect(guide?.lastVerifiedAt).toBe('2026-07-22');
      // Review dates are staggered across the batch so no single day carries a
      // cohort big enough that bulk-bumping beats re-verifying. Assert the
      // window is real and still open rather than pinning one shared date.
      expect(guide?.reviewAfter).toBeTruthy();
      expect(new Date(guide?.reviewAfter ?? '').valueOf()).toBeGreaterThan(
        new Date(guide?.lastVerifiedAt ?? '').valueOf()
      );
      expect(guide?.state).toBe('published');

      const article = readFileSync(join(process.cwd(), 'kb/articles', `${slug}.md`), 'utf8');
      expect(article).toContain(provider);
      expect(article).toContain(narrowing);
      expect(article).toMatch(/\]\(\/toolkits\//);
      expect(article).toMatch(/\]\(https:\/\//);
      expect(article).not.toMatch(/route the case to a human|contact support/i);
    }
  });

  test('keeps the toolkit batch balanced at no more than three guides per toolkit', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'kb/manifest.json'), 'utf8'),
    ) as KbManifest;
    const counts = new Map<string, number>();
    for (const guide of manifest.guides) {
      const toolkit = guide.tags.find(tag =>
        ['instagram', 'canvas', 'slackbot', 'slack', 'linkedin', 'airtable'].includes(tag),
      );
      if (toolkit) counts.set(toolkit, (counts.get(toolkit) ?? 0) + 1);
    }

    expect([...counts.values()].every(count => count <= 3)).toBe(true);
    expect(counts.get('canvas')).toBe(2);
    expect(counts.get('linkedin')).toBe(2);
  });

  test('requires a Slack user token for Enterprise admin conversation writes', () => {
    const article = readFileSync(
      join(process.cwd(), 'kb/articles/slack-admin-conversation-writes-require-enterprise.md'),
      'utf8',
    );
    const generated = readFileSync(
      join(process.cwd(), 'content/kb/guide/slack-admin-conversation-writes-require-enterprise.mdx'),
      'utf8',
    );

    for (const body of [article, generated]) {
      expect(body).toContain('user token with `admin.conversations:write`');
      expect(body).toContain('A bot token with that scope is insufficient');
    }
  });

  test('detects generated content drift in check mode', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);

    expect(() => generateKbContent({ outputDir, check: true })).toThrow(
      'Generated KB content is out of date'
    );
  });
});
