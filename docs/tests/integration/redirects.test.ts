/**
 * Redirect integration tests.
 *
 * Validates that key redirect patterns work correctly — old URLs redirect
 * to valid destinations that return 200.
 */
import { describe, test, expect } from "bun:test";
import { fetchPage, fetchNoRedirect, BASE_URL } from "./helpers";

/** Sample of important redirects to test (from next.config.mjs) */
const REDIRECTS = [
  { from: "/kb/guide/platform-compliance-data-handling", to: "/docs/security/overview" },
  { from: "/kb/sdk-and-api/platform-compliance-data-handling", to: "/docs/security/overview" },
  { from: "/kb/security-and-trust/platform-compliance-data-handling", to: "/docs/security/overview" },
  { from: "/kb/guide/dashboard-log-storage", to: "/docs/security/zero-data-retention" },
  { from: "/kb/errors-and-troubleshooting/dashboard-log-storage", to: "/docs/security/zero-data-retention" },
  { from: "/kb/dashboard-and-projects/don-t-store-data-removes-new-payload-content-not-the-audit-row", to: "/docs/security/zero-data-retention" },
  { from: "/kb/guide/platform-compliance-data-handling.md", to: "/docs/security/overview.md" },
  { from: "/kb/guide/dashboard-log-storage.mdx", to: "/docs/security/zero-data-retention.mdx" },
  { from: "/llms.mdx/kb/guide/dashboard-log-storage", to: "/llms.mdx/docs/security/zero-data-retention" },
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
  { from: "/docs/getting-started", to: "/docs/quickstart" },
  { from: "/docs/tool-tags", to: "/docs/governance/tool-hints" },
  { from: "/docs/tool-tags.md", to: "/docs/governance/tool-hints.md" },
  { from: "/docs/approvals", to: "/docs/governance/approvals" },
  { from: "/docs/approvals.md", to: "/docs/governance/approvals.md" },
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

describe("Redirects - saved tool tag section links", () => {
  test("legacy anchors survive the redirect alongside the renamed headings", async () => {
    const res = await fetchPage("/docs/tool-tags", { timeout: 30_000 });
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(new URL(res.url).pathname).toBe("/docs/governance/tool-hints");

    for (const id of [
      "tags",
      "how-tools-are-tagged",
      "using-tags-in-a-session",
      "hints",
      "how-tools-get-hints",
      "using-hints-in-a-session",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});
