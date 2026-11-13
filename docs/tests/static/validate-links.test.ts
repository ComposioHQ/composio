import { describe, expect, test } from 'bun:test';
import * as linkValidation from '../../scripts/validate-links';

describe('link validation', () => {
  test('strips BOM and CRLF YAML provenance without removing body links', () => {
    const fixture = '\uFEFF---\r\nsources: [{"sourcePath":"guides/example.md","sourceHeading":"Example"}]\r\n---\r\nRead [the guide](/docs/quickstart).\r\n';
    const withoutFrontmatter = (linkValidation as {
      withoutFrontmatter?: (content: string) => string;
    }).withoutFrontmatter;

    expect(withoutFrontmatter).toBeTypeOf('function');
    expect(withoutFrontmatter!(fixture)).toBe('Read [the guide](/docs/quickstart).\r\n');
  });
});
