import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { generateKbContent } from '@/lib/kb/generate';
import { buildKbCatalog } from '@/lib/kb/catalog';
import { createKbArticleReader } from '@/lib/kb/repository';
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

    expect(summary).toEqual({ published: 19, held: 1, files: files.length });
    expect(files).toHaveLength(22);
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
    expect(files.some(file => file.startsWith('toolkits/'))).toBe(false);
    expect(files.some(file => file.startsWith('sdk-and-api/'))).toBe(false);
    expect(files.some(file => file.includes('auth-config-list-pages'))).toBe(false);

    expect(JSON.parse(readFileSync(join(outputDir, 'meta.json'), 'utf8'))).toEqual({
      title: 'Knowledge Base',
      root: true,
      pages: ['index', 'guide'],
    });
    expect(JSON.parse(readFileSync(join(outputDir, 'guide/meta.json'), 'utf8'))).toEqual({
      title: 'Guides',
      pages: [
        'use-tool-router-session-files-as-tool-inputs',
        'pagination-limits-are-endpoint-specific',
        'deduplicate-trigger-webhook-deliveries',
        'custom-connection-data-fields-are-toolkit-specific',
        'ahrefs-actions-use-the-api-host',
        'use-calendly-post-invitee',
        'use-canva-autofill-jobs-for-design-content',
        'granola-mcp-metadata-comes-from-the-upstream-server',
        'inspect-odoo-json-rpc-errors-inside-http-200-responses',
        'strava-athlete-limits-belong-to-the-oauth-app',
        'fix-hubspot-oauth-token-exchange-400-client-secret-and-scopes',
        'choose-current-shopify-app-auth-flow',
        'choose-discordbot-for-bot-token-operations',
        'target-outlook-shared-mailboxes-by-address',
        'google-sheets-oauth-cannot-be-scoped-to-a-drive-folder',
        'use-primary-for-google-calendar-id',
        'google-sheets-auth-configs-require-full-scope-uris',
        'stripe-api-key-connections-require-a-secret-key',
        'snowflake-account-id-uses-org-account-format',
      ],
    });

    const guide = readFileSync(
      join(outputDir, 'guide/pagination-limits-are-endpoint-specific.mdx'),
      'utf8'
    );
    expect(guide).toContain('sourceCommit: "5eed614"');
    expect(guide).toContain(
      'sources: [{"sourcePath":"kb/platform/pagination/public.md","sourceHeading":"Pagination limits are endpoint-specific"}]'
    );
    expect(guide).not.toContain('sourcePath:');
    expect(guide).not.toContain('sourceHeading:');
    expect(guide).not.toContain('articlePath:');
    expect(guide).toContain('lastVerifiedAt: "2026-07-21"');
    expect(guide).toContain('reviewAfter: "2027-01-17"');
    expect(guide).toContain(
      'related:\n  - title: "Use Tool Router session files as toolkit inputs"'
    );
    expect(guide).not.toContain('related: [{');

    const ahrefsGuide = readFileSync(
      join(outputDir, 'guide/ahrefs-actions-use-the-api-host.mdx'),
      'utf8'
    );
    expect(ahrefsGuide).toContain('lastVerifiedAt: "2026-07-22"');
    expect(ahrefsGuide).toContain('reviewAfter: "2026-10-20"');
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

  test('detects generated content drift in check mode', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);

    expect(() => generateKbContent({ outputDir, check: true })).toThrow(
      'Generated KB content is out of date'
    );
  });
});
