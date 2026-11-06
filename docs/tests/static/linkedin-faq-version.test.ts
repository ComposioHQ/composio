/**
 * LinkedIn FAQ version-override regression test.
 *
 * Issue #4320: `LINKEDIN_CREATE_LINKED_IN_POST` fails with HTTP 426
 * `NONEXISTENT_VERSION` when the request runs on a retired LinkedIn API
 * version header (e.g. via the base toolkit version). The `LinkedIn-Version`
 * header itself is set server-side, so the supported client-side recovery is
 * selecting a current toolkit version — and the toolkit FAQ page is where
 * users landing from the integration docs look first. This test locks that
 * the LinkedIn FAQ documents the failure mode and at least one supported
 * version-selection path, so the guidance cannot silently regress out of
 * the page while the server-side header is still being rolled out.
 */
import { describe, test, expect } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";

const LINKEDIN_FAQ = join(
  import.meta.dir,
  "../../content/toolkits/faq/linkedin.md"
);

describe("LinkedIn FAQ - 426 version-override guidance (issue #4320)", () => {
  test("FAQ names the 426 NONEXISTENT_VERSION failure mode", async () => {
    const content = await readFile(LINKEDIN_FAQ, "utf-8");
    expect(content).toContain("426");
    expect(content).toContain("NONEXISTENT_VERSION");
  });

  test("FAQ names the affected post-creation tool", async () => {
    const content = await readFile(LINKEDIN_FAQ, "utf-8");
    expect(content).toContain("LINKEDIN_CREATE_LINKED_IN_POST");
  });

  test("FAQ documents a supported toolkit version-selection path", async () => {
    const content = await readFile(LINKEDIN_FAQ, "utf-8");
    const documentsSelection =
      content.includes("toolkit_versions") ||
      content.includes("toolkitVersions") ||
      content.includes("COMPOSIO_TOOLKIT_VERSION_");
    expect(documentsSelection).toBe(true);
  });

  test("FAQ points at a current toolkit version as the recovery", async () => {
    const content = await readFile(LINKEDIN_FAQ, "utf-8");
    expect(content).toContain("latest");
  });
});
