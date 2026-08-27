/**
 * Page rendering integration tests.
 *
 * Validates that critical pages render successfully (200), return HTML,
 * and contain expected content markers.
 */
import { describe, test, expect } from "bun:test";
import {
  getKnowledgeByToolkit,
  getKnowledgeToolkitSummaries,
} from "@/lib/knowledge/catalog";
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

  test("knowledge topic pages link back to the Knowledge Base home", async () => {
    const res = await fetchPage("/kb/topic/authentication-and-connected-accounts");
    const html = await res.text();
    const topicNavigation = html.match(
      /<nav[^>]*aria-label="Knowledge Base topic navigation"[^>]*>[\s\S]*?<\/nav>/,
    )?.[0];

    expect(res.status).toBe(200);
    expect(topicNavigation).toContain('href="/kb"');
    expect(topicNavigation).toContain('Knowledge Base');
  });

  test("toolkit knowledge pages omit duplicate search and page-count controls", async () => {
    const toolkit = (await getKnowledgeToolkitSummaries()).find(
      (candidate) => candidate.knowledgeCount > 1,
    );
    expect(toolkit).toBeDefined();

    const res = await fetchPage(`/kb/toolkit/${toolkit!.slug}`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).not.toContain('name="knowledge-browse-search"');
    expect(html).not.toMatch(
      /\d+(?:<!-- -->)? public page(?:<!-- -->)?s?(?:<!-- -->)? across Composio sources\./,
    );
  });

  test("routes toolkit knowledge pages based on their resource count", async () => {
    const summaries = await getKnowledgeToolkitSummaries();
    const singleResourceToolkit = summaries.find(
      (toolkit) => toolkit.knowledgeCount === 1,
    );
    const multiResourceToolkit = summaries.find(
      (toolkit) => toolkit.knowledgeCount > 1,
    );

    expect(singleResourceToolkit).toBeDefined();
    expect(multiResourceToolkit).toBeDefined();

    const redirectResponse = await fetchNoRedirect(
      `/kb/toolkit/${singleResourceToolkit!.slug}`,
    );
    expect(redirectResponse.status).toBe(307);
    const redirectLocation = redirectResponse.headers.get("location");
    expect(redirectLocation).toBeTruthy();
    expect(
      new URL(redirectLocation!, "http://localhost").pathname,
    ).toBe(`/toolkits/${singleResourceToolkit!.slug}`);

    const knowledgeResponse = await fetchNoRedirect(
      `/kb/toolkit/${multiResourceToolkit!.slug}`,
    );
    expect(knowledgeResponse.status).toBe(200);
  });

  test("keeps agent-readable toolkit routes aligned with HTML routes", async () => {
    const summaries = await getKnowledgeToolkitSummaries();
    const singleResourceToolkit = summaries.find(
      (toolkit) => toolkit.knowledgeCount === 1,
    );
    const multiResourceToolkit = summaries.find(
      (toolkit) => toolkit.knowledgeCount > 1,
    );

    expect(singleResourceToolkit).toBeDefined();
    expect(multiResourceToolkit).toBeDefined();

    const redirectResponse = await fetchNoRedirect(
      `/kb/toolkit/${singleResourceToolkit!.slug}.md`,
    );
    expect(redirectResponse.status).toBe(307);
    const redirectLocation = redirectResponse.headers.get("location");
    expect(redirectLocation).toBe(`/toolkits/${singleResourceToolkit!.slug}.md`);

    const knowledgeResponse = await fetchNoRedirect(
      `/kb/toolkit/${multiResourceToolkit!.slug}.md`,
    );
    expect(knowledgeResponse.status).toBe(200);
  });

  test("toolkit knowledge pages open only external cards in a new tab", async () => {
    const summaries = await getKnowledgeToolkitSummaries();
    let toolkitWithMixedLinks: (typeof summaries)[number] | undefined;
    let toolkitLinks: Awaited<ReturnType<typeof getKnowledgeByToolkit>> = [];

    for (const toolkit of summaries) {
      if (toolkit.knowledgeCount <= 1) continue;
      const links = await getKnowledgeByToolkit(toolkit.slug);
      const hasExternalLink = links.some((link) => /^https?:\/\//.test(link.href));
      const hasInternalLink = links.some((link) => !/^https?:\/\//.test(link.href));
      if (hasExternalLink && hasInternalLink) {
        toolkitWithMixedLinks = toolkit;
        toolkitLinks = links;
        break;
      }
    }

    expect(toolkitWithMixedLinks).toBeDefined();
    const res = await fetchPage(`/kb/toolkit/${toolkitWithMixedLinks!.slug}`);
    const html = await res.text();
    const collection = html.match(
      /<ul[^>]*aria-label="Toolkit knowledge sources"[^>]*>[\s\S]*?<\/ul>/,
    )?.[0];
    const externalLinkCount = toolkitLinks.filter((link) =>
      /^https?:\/\//.test(link.href),
    ).length;
    const internalLink = toolkitLinks.find((link) => !/^https?:\/\//.test(link.href));

    expect(res.status).toBe(200);
    expect(collection).toBeDefined();
    expect((collection?.match(/target="_blank"/g) ?? []).length).toBe(
      externalLinkCount,
    );
    expect(collection).toContain(`href="${internalLink!.href}"`);
  });

  test("guide pages omit the redundant Knowledge Base home link", async () => {
    const res = await fetchPage("/kb/guide/toolkits-airtable");
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).not.toContain("Knowledge Base home");
    expect(html).toContain("Support topics");
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
