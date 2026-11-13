import { describe, expect, test } from 'bun:test';
import { scanURLs, validateFiles } from 'next-validate-link';
import { getKnowledgeToolkitSummaries } from '@/lib/knowledge/catalog';
import * as linkValidation from '../../scripts/validate-links';

describe('link validation', () => {
  test('accepts known toolkit HTML and Markdown routes while rejecting unknown toolkits', async () => {
    const scanned = await scanURLs({
      preset: 'next',
      populate: {
        '(home)/toolkits/[[...slug]]': await linkValidation.getDynamicToolkitEntries(),
      },
    });
    const errors = await validateFiles([{
      path: 'toolkit-links.mdx',
      url: '/kb/guide/toolkits-gmail',
      content: [
        '[Gmail](/toolkits/gmail)',
        '[Gmail Markdown](/toolkits/gmail.md)',
        '[Gmail MDX](/toolkits/gmail.mdx)',
        '[Unknown toolkit](/toolkits/not-a-real-toolkit.md)',
      ].join('\n'),
    }], { scanned, checkRelativePaths: 'as-url', checkExternal: false });

    expect(errors.flatMap(file => file.errors.map(error => error.url))).toEqual([
      '/toolkits/not-a-real-toolkit.md',
    ]);
  });

  test('strips BOM and CRLF YAML provenance without removing body links', () => {
    const fixture = '\uFEFF---\r\nsources: [{"sourcePath":"kb/toolkits/example/public.md","sourceHeading":"Example"}]\r\n---\r\nRead [the guide](/kb/guide/example).\r\n';
    const withoutFrontmatter = (linkValidation as {
      withoutFrontmatter?: (content: string) => string;
    }).withoutFrontmatter;

    expect(withoutFrontmatter).toBeTypeOf('function');
    expect(withoutFrontmatter!(fixture)).toBe('Read [the guide](/kb/guide/example).\r\n');
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
