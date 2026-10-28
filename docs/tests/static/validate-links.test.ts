import { describe, expect, test } from 'bun:test';
import { getKnowledgeToolkitSummaries } from '@/lib/knowledge/catalog';
import * as linkValidation from '../../scripts/validate-links';

describe('link validation', () => {
  test('strips BOM and CRLF YAML provenance without removing body links', () => {
    const fixture = '\uFEFF---\r\nsources: [{"sourcePath":"kb/toolkits/example/public.md","sourceHeading":"Example"}]\r\n---\r\nRead [the guide](/kb/guide/example).\r\n';
    const withoutFrontmatter = (linkValidation as {
      withoutFrontmatter?: (content: string) => string;
    }).withoutFrontmatter;

    expect(withoutFrontmatter).toBeTypeOf('function');
    expect(withoutFrontmatter!(fixture)).toBe('Read [the guide](/kb/guide/example).\r\n');
  });

  test('accepts links to files served from public/ and rejects missing or escaping paths', () => {
    expect(linkValidation.isPublicFileUrl('/assets/migrations/migrate_no_auth_to_instant.py')).toBe(true);
    expect(linkValidation.isPublicFileUrl('/assets/migrations/migrate_no_auth_to_instant.py#usage')).toBe(true);
    expect(linkValidation.isPublicFileUrl('/assets/migrations/missing.py')).toBe(false);
    expect(linkValidation.isPublicFileUrl('/assets/migrations')).toBe(false);
    expect(linkValidation.isPublicFileUrl('/../package.json')).toBe(false);
    expect(linkValidation.isPublicFileUrl('/%2e%2e/package.json')).toBe(false);
    expect(linkValidation.isPublicFileUrl('//example.com/robots.txt')).toBe(false);
    expect(linkValidation.isPublicFileUrl('/%E0%A4%A.py')).toBe(false);
  });

  test('accepts redirecting toolkit knowledge routes as resolvable links', async () => {
    const redirectingToolkit = (await getKnowledgeToolkitSummaries()).find(
      toolkit => toolkit.knowledgeCount === 1,
    );

    expect(redirectingToolkit).toBeDefined();

    const entries = await linkValidation.getKnowledgeToolkitRouteEntries();
    expect(entries.map(entry => entry.value)).toContain(redirectingToolkit!.slug);
  });
});
