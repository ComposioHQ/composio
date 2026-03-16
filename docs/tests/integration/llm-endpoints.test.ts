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

describe("LLM endpoints - .md pages", () => {
  const MD_PAGES = [
    { path: "/docs/quickstart.md", name: "Quickstart" },
    { path: "/docs/authentication.md", name: "Authentication" },
    { path: "/docs/tools-and-toolkits.md", name: "Tools & Toolkits" },
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
