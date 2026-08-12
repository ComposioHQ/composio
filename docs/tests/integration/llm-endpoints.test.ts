/**
 * LLM endpoint integration tests.
 *
 * Validates that .md endpoints return well-formed markdown with proper
 * content-type headers and guardrails.
 */
import { describe, test, expect } from "bun:test";
import { fetchPage } from "./helpers";

describe("LLM endpoints - llms.txt", () => {
  test("/llms.txt returns 200 with text content", async () => {
    const res = await fetchPage("/llms.txt");
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text.length).toBeGreaterThan(100);
    // Should contain page links
    expect(text).toContain("composio");
  });
});

/**
 * Version labelling of the machine-readable indexes.
 *
 * `/reference/v3/` is the only version-shaped path in the corpus, so a search
 * for "composio api v3" matches the superseded tree exactly. Both index files
 * used to list the two trees interleaved under one unlabelled `## API
 * Reference` heading with no v3.1 string anywhere.
 */
describe("LLM endpoints - API reference version labelling", () => {
  const CURRENT_HEADING = "## API Reference (v3.1, current)";
  const LEGACY_HEADING_PREFIX = "## API Reference (v3.0, legacy";

  test("/llms.txt labels the current reference group", async () => {
    const text = await (await fetchPage("/llms.txt")).text();
    expect(text).toContain(CURRENT_HEADING);
  });

  test("/llms.txt has no unlabelled API Reference heading", async () => {
    const text = await (await fetchPage("/llms.txt")).text();
    expect(text.split("\n")).not.toContain("## API Reference");
  });

  test("/llms.txt groups every legacy URL under the legacy heading, not interleaved", async () => {
    const lines = (await (await fetchPage("/llms.txt")).text()).split("\n");

    const legacyStart = lines.findIndex(line => line.startsWith(LEGACY_HEADING_PREFIX));
    expect(legacyStart, "no legacy reference group").toBeGreaterThan(-1);

    // The legacy group runs to the next ## heading.
    let legacyEnd = lines.findIndex(
      (line, i) => i > legacyStart && line.startsWith("## "),
    );
    if (legacyEnd === -1) legacyEnd = lines.length;

    const strays = lines
      .map((line, i) => ({ line, i }))
      .filter(
        ({ line, i }) =>
          line.includes("/reference/v3/") && (i < legacyStart || i >= legacyEnd),
      )
      .map(({ line }) => line);

    expect(strays, `legacy URLs outside the legacy group:\n${strays.join("\n")}`).toEqual([]);
  });

  test("/llms-full.txt carries no v3.0 page bodies", async () => {
    const text = await (await fetchPage("/llms-full.txt")).text();
    expect(text).not.toContain("/reference/v3/");
    expect(text).toContain("# Tools (/reference/api-reference/tools)");
  });
});

describe("LLM endpoints - .md pages", () => {
  const MD_PAGES = [
    { path: "/docs/quickstart.md", name: "Quickstart" },
    { path: "/docs/authentication.md", name: "Authentication" },
    { path: "/docs/how-composio-works.md", name: "How Composio works" },
  ];

  for (const { path, name } of MD_PAGES) {
    test(`${name} (${path}) returns markdown`, async () => {
      const res = await fetchPage(path);
      expect(res.status).toBe(200);

      const contentType = res.headers.get("content-type") || "";
      expect(contentType).toContain("text/markdown");
    });

    test(`${name} (${path}) has a title heading`, async () => {
      const res = await fetchPage(path);
      const text = await res.text();
      // Should start with a markdown heading
      expect(text).toMatch(/^#\s+.+/);
    });

    test(`${name} (${path}) has meaningful content (> 200 chars)`, async () => {
      const res = await fetchPage(path);
      const text = await res.text();
      expect(text.length).toBeGreaterThan(200);
    });
  }
});

describe("LLM endpoints - guardrails", () => {
  test("quickstart.md includes guardrail content", async () => {
    const res = await fetchPage("/docs/quickstart.md");
    const text = await res.text();
    // Default guardrails should be appended (session-based pattern)
    // The exact content varies but should include the footer
    expect(text).toContain("More documentation");
  });
});

describe("LLM endpoints - toolkit markdown", () => {
  test("/toolkits.md returns toolkit index", async () => {
    const res = await fetchPage("/toolkits.md");
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain("Toolkits");
    expect(text.toLowerCase()).toContain("github");
  });
});

describe("LLM endpoints - error handling", () => {
  test("non-existent .md page returns 404", async () => {
    const res = await fetchPage("/docs/nonexistent-page-xyz.md");
    expect(res.status).toBe(404);
  });
});
