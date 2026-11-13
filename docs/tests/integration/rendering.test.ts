/**
 * Page rendering integration tests.
 *
 * Validates that critical pages render successfully (200), return HTML,
 * and contain expected content markers.
 */
import { describe, test, expect } from "bun:test";
import { fetchNoRedirect, fetchPage } from "./helpers";

/** Critical pages that must always render */
const CRITICAL_PAGES = [
  { path: "/docs", name: "Docs home" },
  { path: "/docs/quickstart", name: "Quickstart" },
  { path: "/docs/authentication", name: "Authentication" },
  { path: "/docs/how-composio-works", name: "How Composio works" },
  { path: "/docs/users-and-sessions", name: "Users & Sessions" },
  { path: "/examples", name: "Examples index" },
  { path: "/toolkits", name: "Toolkits index" },
  { path: "/reference", name: "Reference index" },
];

const DEPRECATED_API_LEGACY_TITLE =
  "Deprecated API endpoint; kept for existing integrations and may be removed in a future release";

const DEPRECATED_API_PAGES = [
  "/reference/api-reference/connected-accounts/postConnectedAccountsByNanoidRefresh",
  "/reference/api-reference/files/getFilesList",
  "/reference/v3/api-reference/connected-accounts/postConnectedAccountsByNanoidRefresh",
  "/reference/v3/api-reference/files/getFilesList",
];

const ACTIVE_API_PAGES = [
  "/reference/api-reference/files/postFilesUploadRequest",
  "/reference/v3/api-reference/files/postFilesUploadRequest",
];

function getPageHeading(html: string): string | undefined {
  return html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0];
}

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
  test("docs homepage social metadata survives the root redirect", async () => {
    const res = await fetchPage("/", { timeout: 30_000, headers: { "User-Agent": "facebookexternalhit/1.1" } });
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(new URL(res.url).pathname).toBe('/docs');
    expect(html).toContain('<title>Build and operate AI agents | Composio Documentation</title>');
    expect(html).toContain('<meta property="og:site_name" content="Composio Docs"');
    expect(html).toContain('<meta property="og:title" content="Build and operate AI agents"');
    expect(html).toContain('<meta property="og:image" content="https://docs.composio.dev/api/og?section=home&amp;description=');
    expect(html).toContain('<meta name="twitter:image" content="https://docs.composio.dev/api/og?section=home&amp;description=');
    const description = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1];
    expect(description).toBe('Give your agents tools, managed authentication, and secure execution. Get started with the SDK, CLI, or MCP.');
    expect(description!.length).toBeLessThanOrEqual(125);
  });

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

describe("Page rendering - deprecated API endpoints", () => {
  for (const path of DEPRECATED_API_PAGES) {
    test(`${path} renders the Legacy badge`, async () => {
      const res = await fetchPage(path);
      const html = await res.text();
      const heading = getPageHeading(html);

      expect(res.status).toBe(200);
      expect(heading).toBeDefined();
      expect(heading).toContain(DEPRECATED_API_LEGACY_TITLE);
    });
  }

  for (const path of ACTIVE_API_PAGES) {
    test(`${path} omits the Legacy badge`, async () => {
      const res = await fetchPage(path);
      const html = await res.text();
      const heading = getPageHeading(html);

      expect(res.status).toBe(200);
      expect(heading).toBeDefined();
      expect(heading).not.toContain(DEPRECATED_API_LEGACY_TITLE);
    });
  }

  test("deprecated endpoint sidebar links replace the title marker with Legacy", async () => {
    const path = DEPRECATED_API_PAGES[0];
    const res = await fetchPage(path);
    const html = await res.text();
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sidebarLink = html.match(
      new RegExp(`<a[^>]*href="${escapedPath}"[^>]*>[\\s\\S]*?<\\/a>`),
    )?.[0];

    expect(res.status).toBe(200);
    expect(sidebarLink).toBeDefined();
    expect(sidebarLink).toContain(">Legacy</span>");
    expect(sidebarLink).not.toContain("(DEPRECATED)");
    expect(sidebarLink).toContain(">POST</span>");
  });
});

describe("Page rendering - error handling", () => {
  test("non-existent page returns 404", async () => {
    const res = await fetchPage("/docs/this-page-does-not-exist-ever");
    expect(res.status).toBe(404);
  });
});
