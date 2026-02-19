/**
 * Page rendering integration tests.
 *
 * Validates that critical pages render successfully (200), return HTML,
 * and contain expected content markers.
 */
import { describe, test, expect } from "bun:test";
import { fetchPage } from "./helpers";

/** Critical pages that must always render */
const CRITICAL_PAGES = [
  { path: "/docs", name: "Docs home" },
  { path: "/docs/quickstart", name: "Quickstart" },
  { path: "/docs/authentication", name: "Authentication" },
  { path: "/docs/tools-and-toolkits", name: "Tools & Toolkits" },
  { path: "/docs/users-and-sessions", name: "Users & Sessions" },
  { path: "/cookbooks", name: "Cookbooks index" },
  { path: "/toolkits", name: "Toolkits index" },
  { path: "/reference", name: "Reference index" },
];

describe("Page rendering - critical pages", () => {
  for (const { path, name } of CRITICAL_PAGES) {
    test(`${name} (${path}) returns 200`, async () => {
      const res = await fetchPage(path);
      expect(res.status).toBe(200);
    });

    test(`${name} (${path}) returns HTML`, async () => {
      const res = await fetchPage(path);
      const contentType = res.headers.get("content-type") || "";
      expect(contentType).toContain("text/html");
    });
  }
});

describe("Page rendering - content markers", () => {
  test("docs home contains navigation elements", async () => {
    const res = await fetchPage("/docs");
    const html = await res.text();
    // Should have some sidebar/nav content
    expect(html).toContain("Quickstart");
  });

  test("quickstart page contains expected content", async () => {
    const res = await fetchPage("/docs/quickstart");
    const html = await res.text();
    expect(html.toLowerCase()).toContain("composio");
  });

  test("toolkits page renders toolkit cards", async () => {
    const res = await fetchPage("/toolkits");
    const html = await res.text();
    // Should contain at least one well-known toolkit
    expect(html.toLowerCase()).toContain("github");
  });
});

describe("Page rendering - error handling", () => {
  test("non-existent page returns 404", async () => {
    const res = await fetchPage("/docs/this-page-does-not-exist-ever");
    expect(res.status).toBe(404);
  });
});
