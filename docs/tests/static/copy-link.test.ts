import { describe, expect, test } from "bun:test";
import { resolveCopyLinkUrl } from "../../lib/copy-link";

describe("resolveCopyLinkUrl", () => {
  test("keeps the current pathname for anchor links", () => {
    expect(
      resolveCopyLinkUrl(
        "#2026-04-08",
        "https://docs.composio.dev/reference/changelog"
      )
    ).toBe("https://docs.composio.dev/reference/changelog#2026-04-08");
  });

  test("resolves site-relative links from the docs origin", () => {
    expect(
      resolveCopyLinkUrl(
        "/docs/changelog/2026/04/08",
        "https://docs.composio.dev/reference/changelog"
      )
    ).toBe("https://docs.composio.dev/docs/changelog/2026/04/08");
  });
});
