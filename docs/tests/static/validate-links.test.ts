import { describe, expect, test } from 'bun:test';
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
});
