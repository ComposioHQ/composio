import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { generateKbContent } from '@/lib/kb/generate';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function listFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
}

describe('public KB content generation', () => {
  test('generates native Fumadocs pages for published guides only', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);

    const summary = generateKbContent({ outputDir });
    const files = listFiles(outputDir);

    expect(summary).toEqual({ published: 10, held: 1, files: files.length });
    expect(files).toHaveLength(13);
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
    expect(files.some((file) => file.startsWith('toolkits/'))).toBe(false);
    expect(files.some((file) => file.startsWith('sdk-and-api/'))).toBe(false);
    expect(files.some((file) => file.includes('auth-config-list-pages'))).toBe(false);

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
      ],
    });

    const guide = readFileSync(
      join(outputDir, 'guide/pagination-limits-are-endpoint-specific.mdx'),
      'utf8',
    );
    expect(guide).toContain('sourceCommit: "5eed614"');
    expect(guide).toContain('lastVerifiedAt: "2026-07-21"');
    expect(guide).toContain('reviewAfter: "2027-01-17"');
    expect(guide).toContain(
      'related:\n  - title: "Use Tool Router session files as toolkit inputs"',
    );
    expect(guide).not.toContain('related: [{');

    const ahrefsGuide = readFileSync(
      join(outputDir, 'guide/ahrefs-actions-use-the-api-host.mdx'),
      'utf8',
    );
    expect(ahrefsGuide).toContain('lastVerifiedAt: "2026-07-22"');
    expect(ahrefsGuide).toContain('reviewAfter: "2026-10-20"');
    expect(ahrefsGuide).not.toContain('route the case to a human');
  });

  test('detects generated content drift in check mode', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'composio-kb-'));
    temporaryDirectories.push(outputDir);

    expect(() => generateKbContent({ outputDir, check: true })).toThrow(
      'Generated KB content is out of date',
    );
  });
});
