import { describe, expect, test } from "bun:test";

import { encodeMarkdownTableCell, encodeYamlString } from "../../lib/markdown-escaping";

describe("Markdown and frontmatter escaping", () => {
  test("encodes every table delimiter without consuming existing backslashes", () => {
    expect(encodeMarkdownTableCell(String.raw`first \| second | third`)).toBe(
      String.raw`first \&#124; second &#124; third`
    );
  });

  test("collapses every line ending inside table cells", () => {
    expect(encodeMarkdownTableCell("first\r\nsecond\rthird\nfourth")).toBe(
      "first second third fourth"
    );
  });

  test("serializes quotes, backslashes, and control characters as a YAML string", () => {
    expect(encodeYamlString('Use "quotes" at C:\\tools\nnext')).toBe(
      '"Use \\"quotes\\" at C:\\\\tools\\nnext"'
    );
  });
});
