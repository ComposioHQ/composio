/**
 * Redirect integration tests.
 *
 * Validates that key redirect patterns work correctly — old URLs redirect
 * to valid destinations that return 200.
 */
import { describe, test, expect } from "bun:test";
import { fetchPage, fetchNoRedirect, BASE_URL } from "./helpers";

/** Exact failed requests from DEVREL-304, including machine-readable routes. */
const EVIDENCED_REDIRECTS = [
  { from: "/docs/auth-and-connected-accounts", to: "/docs/authentication", markdown: false },
  { from: "/docs/getting-started", to: "/docs/quickstart", markdown: false },
  { from: "/authentication/authentication-overview", to: "/docs/authentication", markdown: false },
  { from: "/authentication/connected-accounts/overview", to: "/docs/authentication/manually-authenticating", markdown: false },
  { from: "/llms.mdx/authentication/connected-accounts/overview", to: "/docs/authentication/manually-authenticating.md", markdown: true },
  { from: "/llms.mdx/sessions/sessions-via-mcp", to: "/docs/sessions-via-mcp.md", markdown: true },
  { from: "/docs/manually-authenticating.md", to: "/docs/authentication/manually-authenticating.md", markdown: true },
];

/** Sample of important redirects to test (from next.config.mjs) */
const REDIRECTS = [
  ...EVIDENCED_REDIRECTS,
  { from: "/", to: "/docs" },
  { from: "/cookbooks", to: "/examples" },
  { from: "/api-reference", to: "/reference" },
  { from: "/providers/openai", to: "/docs/providers/openai" },
  { from: "/providers/anthropic", to: "/docs/providers/anthropic" },
  { from: "/providers/openai-agents", to: "/docs/providers/openai" },
  { from: "/docs/providers/openai-agents", to: "/docs/providers/openai" },
  { from: "/docs/providers/claude-agent-sdk", to: "/docs/providers/anthropic" },
  { from: "/providers/google-adk", to: "/docs/providers/google" },
  { from: "/docs/providers/google-adk", to: "/docs/providers/google" },
  { from: "/providers/langgraph", to: "/docs/providers/langchain" },
  { from: "/docs/providers/langgraph", to: "/docs/providers/langchain" },
  { from: "/tools", to: "/toolkits" },
  { from: "/docs/fetching-tools", to: "/docs/tools-direct/fetching-tools" },
  { from: "/docs/custom-tools", to: "/docs/extending-sessions/custom-tools-and-toolkits" },
  { from: "/docs/tools-direct/custom-tools", to: "/docs/extending-sessions/custom-tools-and-toolkits" },
  { from: "/docs/tools-direct/custom-tools/github", to: "/docs/extending-sessions/custom-tools-and-toolkits" },
  { from: "/custom-tools/github", to: "/docs/extending-sessions/custom-tools-and-toolkits" },
  { from: "/docs/how-tools-work", to: "/docs/how-composio-works" },
  { from: "/authentication", to: "/docs/authentication" },
  { from: "/changelog", to: "/docs/changelog" },
  { from: "/docs/mcp-quickstart", to: "/docs/single-toolkit-mcp" },
  { from: "/docs/welcome", to: "/docs" },
  { from: "/docs/managed-authentication", to: "/docs/authentication" },
  { from: "/docs/workbench", to: "/docs/sandbox/remote" },
  { from: "/docs/sandbox", to: "/docs/sandbox/remote" },
  { from: "/docs/custom-tools-and-toolkits", to: "/docs/extending-sessions/custom-tools-and-toolkits" },
  { from: "/docs/proxy-execute", to: "/docs/extending-sessions/proxy-execute" },
  { from: "/docs/white-labeling-authentication", to: "/docs/authentication/white-labeling-authentication" },
  { from: "/docs/shared-connections", to: "/docs/extending-sessions/shared-connections" },
  { from: "/docs/manually-authenticating", to: "/docs/authentication/manually-authenticating" },
  { from: "/docs/security", to: "/docs/security/overview" },
  { from: "/docs/self-hosting", to: "/docs/security/token-custody#deployment-options" },
  { from: "/docs/auth", to: "/docs/authentication" },
  { from: "/docs/auth-management/overview", to: "/docs/authentication" },
  { from: "/docs/managed-auth", to: "/docs/authentication/custom-app-vs-managed-app" },
  { from: "/docs/authentication/overview", to: "/docs/authentication" },
];

describe("Redirects - key patterns", () => {
  for (const { from, to } of REDIRECTS) {
    test(`${from} → ${to}`, async () => {
      const res = await fetchNoRedirect(from);
      // Should be a 301 or 308 redirect
      expect([301, 302, 307, 308]).toContain(res.status);

      const location = res.headers.get("location") || "";
      // Location might be absolute or relative
      const normalizedLocation = location
        .replace(BASE_URL, "")
        .split("?")[0]; // Strip query params
      expect(normalizedLocation).toBe(to);
    });
  }
});

describe("Redirects - destinations are valid", () => {
  test("all redirect destinations return 200", async () => {
    const destinations = [...new Set(REDIRECTS.map((r) => r.to))];
    const failures: string[] = [];

    for (const dest of destinations) {
      const res = await fetchPage(dest);
      if (res.status !== 200) {
        failures.push(`${dest} returned ${res.status}`);
      }
    }

    expect(failures).toEqual([]);
  });
});

describe("Evidenced legacy routes - response representations", () => {
  for (const { from, to, markdown } of EVIDENCED_REDIRECTS) {
    test(`${from} serves the canonical ${markdown ? "Markdown" : "HTML"} topic`, async () => {
      const response = await fetchPage(from, {
        headers: { Accept: "text/html", "User-Agent": "facebookexternalhit/1.1" },
        timeout: 30_000,
      });
      expect(response.status).toBe(200);
      expect(new URL(response.url).pathname).toBe(to);
      expect(response.headers.get("content-type")).toContain(markdown ? "text/markdown" : "text/html");
      const body = await response.text();
      const canonical = `https://docs.composio.dev${to.replace(/\.md$/, "")}`;
      if (markdown) {
        expect(body).toContain(`canonical_url: "${canonical}"`);
        expect(body).toMatch(/^# .+/m);
        expect(body).not.toMatch(/<!doctype html/i);
      } else {
        expect(body).toContain(`<link rel="canonical" href="${canonical}"`);
        expect(body).toContain("<h1");
      }
    });

    if (!markdown) {
      for (const accept of ["text/markdown", "text/plain"]) {
        test(`${from} preserves ${accept} negotiation`, async () => {
          const response = await fetchPage(from, { headers: { Accept: accept }, timeout: 30_000 });
          expect(response.status).toBe(200);
          expect(response.headers.get("content-type")).toContain("text/markdown");
          expect(await response.text()).toContain(`canonical_url: "https://docs.composio.dev${to}"`);
        });
      }
    }
  }

  test("unknown documentation routes remain 404s", async () => {
    for (const path of [
      "/authentication/not-a-real-guide",
      "/llms.mdx/authentication/not-a-real-guide",
      "/docs/not-a-real-guide.md",
    ]) {
      const response = await fetchPage(path, { timeout: 30_000 });
      expect(response.status).toBe(404);
      expect(new URL(response.url).pathname).toBe(path);
    }
  });
});
