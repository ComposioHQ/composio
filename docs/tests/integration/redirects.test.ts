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
  { from: "/", to: "/docs" },
  { from: "/examples", to: "/cookbooks" },
  { from: "/api-reference", to: "/reference" },
  { from: "/providers/openai", to: "/docs/providers/openai" },
  { from: "/providers/anthropic", to: "/docs/providers/anthropic" },
  { from: "/tools", to: "/toolkits" },
  { from: "/docs/fetching-tools", to: "/docs/tools-direct/fetching-tools" },
  { from: "/docs/custom-tools", to: "/docs/tools-direct/custom-tools" },
  { from: "/docs/how-tools-work", to: "/docs/tools-and-toolkits" },
  { from: "/authentication", to: "/docs/authentication" },
  { from: "/changelog", to: "/docs/changelog" },
  { from: "/docs/mcp-quickstart", to: "/docs/single-toolkit-mcp" },
  { from: "/docs/welcome", to: "/docs" },
  { from: "/docs/managed-authentication", to: "/docs/authentication" },
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
