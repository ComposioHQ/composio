import { beforeAll, describe, expect, mock, test } from "bun:test";

import {
  REST_VERSION_GUIDANCE,
  TOOL_VERSION_GUIDANCE,
} from "../../lib/api-version-guidance";
import { SESSION_GUARDRAILS } from "../../lib/llm-guardrails";

let bundledSpec: Record<string, unknown> = {};

mock.module("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  usePathname: () => "/reference/api-reference/tasks",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("@/lib/toolkit-data", () => ({
  getAllToolkits: async () => [],
  getToolkitBySlug: async () => null,
}));
mock.module("@/lib/meta-tools-data", () => ({
  getAllMetaTools: async () => [],
  getMetaToolBySlug: async () => null,
}));
mock.module("@/lib/toolkit-schema", () => ({
  apiToolListSchema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
  apiTriggerListSchema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
  processSchema: (schema: unknown) => schema,
  toolFromApi: (tool: unknown) => tool,
}));

let openapiPageToMarkdown: typeof import("../../app/llms.mdx/[[...slug]]/route").openapiPageToMarkdown;
let degradedPageToMarkdown: typeof import("../../app/llms.mdx/[[...slug]]/route").degradedPageToMarkdown;

beforeAll(async () => {
  ({ openapiPageToMarkdown, degradedPageToMarkdown } = await import(
    "../../app/llms.mdx/[[...slug]]/route"
  ));
});

describe("LLM OpenAPI markdown", () => {
  test("continues to render API operations with endpoint and cURL details", async () => {
    bundledSpec = {
      paths: {
        "/v3.1/test": {
          get: {
            summary: "Get test",
            responses: {
              200: { description: "Success" },
            },
          },
        },
      },
      servers: [{ url: "https://backend.example.com" }],
    };

    const markdown = await openapiPageToMarkdown({
      url: "/reference/api-reference/test/getTest",
      data: {
        title: "Get test",
        getOpenAPIPageProps: () => ({
          payload: { bundled: bundledSpec },
          operations: [{ path: "/v3.1/test", method: "GET" }],
        }),
      },
    });

    expect(markdown).toContain("**Endpoint:** `https://backend.example.com/v3.1/test`");
    expect(markdown).toContain("### Example cURL Request");
    expect(markdown).toContain(
      'curl -X GET "https://backend.example.com/v3.1/test"',
    );
  });

  test("renders webhook delivery headers and payload schema", async () => {
    bundledSpec = {
      openapi: "3.1.0",
      webhooks: {
        "composio.test.event": {
          post: {
            summary: "Test event",
            parameters: [
              {
                name: "webhook-id",
                in: "header",
                required: true,
                description: "Stable delivery identifier.",
                schema: { type: "string" },
              },
            ],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["id"],
                    properties: {
                      id: {
                        type: "string",
                        description: "Unique event identifier.",
                      },
                    },
                  },
                  example: { id: "msg_test" },
                },
              },
            },
            responses: {
              200: { description: "Delivery accepted" },
            },
          },
        },
      },
    };

    const markdown = await openapiPageToMarkdown({
      url: "/reference/api-reference/webhook-events/composio_test_event",
      data: {
        title: "Test event",
        getOpenAPIPageProps: () => ({
          payload: { bundled: bundledSpec },
          webhooks: [{ name: "composio.test.event", method: "post" }],
        }),
      },
    });

    expect(markdown).toContain("## POST `composio.test.event`");
    expect(markdown).toContain("### Delivery Headers");
    expect(markdown).toContain(
      "- `webhook-id` (string) *(required)*: Stable delivery identifier.",
    );
    expect(markdown).toContain("### Request Body");
    expect(markdown).toContain(
      "- `id` (string) *(required)*: Unique event identifier.",
    );
    expect(markdown).toContain('"id": "msg_test"');
    expect(markdown).not.toContain("### Example cURL Request");
  });

  test("bounds recursive array type rendering", async () => {
    bundledSpec = {
      paths: {
        "/v3.1/test": {
          get: {
            parameters: [
              {
                name: "tree",
                in: "query",
                schema: { $ref: "#/components/schemas/RecursiveArray" },
              },
            ],
            responses: {
              200: { description: "Success" },
            },
          },
        },
      },
      components: {
        schemas: {
          RecursiveArray: {
            type: "array",
            items: { $ref: "#/components/schemas/RecursiveArray" },
          },
        },
      },
    };

    const markdown = await openapiPageToMarkdown({
      url: "/reference/api-reference/test/getTest",
      data: {
        title: "Get test",
        getOpenAPIPageProps: () => ({
          payload: { bundled: bundledSpec },
          operations: [{ path: "/v3.1/test", method: "GET" }],
        }),
      },
    });

    expect(markdown).toContain(
      "- `tree` (array<array<array<array<array<...>>>>>):",
    );
  });
});

/**
 * Version identity on operation pages.
 *
 * These are the pages that publish a complete working curl example, so they
 * are the strongest signal an agent acts on — and they never touch
 * mdxToCleanMarkdown, so a fix confined to lib/source.ts leaves them alone.
 *
 * Every fixture below uses production-shaped spec path keys — `/api/v3.1/…`
 * and `/api/v3/…`, with the `/api` segment — because that is what the
 * committed specs contain. The synthetic `/v3.1/test` keys in the fixtures
 * above predate this and are deliberately left alone; do not copy their shape
 * down here, or these tests will pass against an implementation that
 * mis-normalizes production paths.
 */
describe("LLM OpenAPI markdown — API version identity", () => {
  function specWith(pathKey: string) {
    return {
      paths: {
        [pathKey]: {
          get: {
            summary: "Fixture operation",
            responses: { 200: { description: "Success" } },
          },
        },
      },
      servers: [{ url: "https://backend.composio.dev" }],
    };
  }

  function renderOperation(pageUrl: string, pathKey: string) {
    bundledSpec = specWith(pathKey);
    return openapiPageToMarkdown({
      url: pageUrl,
      data: {
        title: "Fixture operation",
        getOpenAPIPageProps: () => ({
          payload: { bundled: bundledSpec },
          operations: [{ path: pathKey, method: "GET" }],
        }),
      },
    });
  }

  const V31_PAGE = "/reference/api-reference/auth-configs/getAuthConfigs";
  const V30_PAGE = "/reference/v3/api-reference/auth-configs/getAuthConfigs";

  test("a v3.1 operation page carries the current-version pointer above the endpoint line", async () => {
    const markdown = await renderOperation(V31_PAGE, "/api/v3.1/auth_configs");

    expect(markdown).toContain("**API version:**");
    // Above **Endpoint:**, so a truncating reader still sees it.
    expect(markdown.indexOf("**API version:**")).toBeLessThan(
      markdown.indexOf("**Endpoint:**"),
    );
  });

  test("a v3.0 operation page carries the legacy pointer and links its v3.1 page", async () => {
    const markdown = await renderOperation(V30_PAGE, "/api/v3/auth_configs");

    expect(markdown).toContain("**API version:**");
    expect(markdown).toContain("v3.0");
    expect(markdown).toContain(
      "/reference/api-reference/auth-configs/getAuthConfigs.md",
    );
    expect(markdown.indexOf("**API version:**")).toBeLessThan(
      markdown.indexOf("**Endpoint:**"),
    );
  });

  test.each([
    ["v3.1", V31_PAGE, "/api/v3.1/tools/{tool_slug}"],
    ["v3.0", V30_PAGE, "/api/v3/tools/{tool_slug}"],
  ])(
    "a tool endpoint on %s carries both guidance constants exactly once",
    async (_label, pageUrl, pathKey) => {
      const markdown = await renderOperation(pageUrl, pathKey);

      // The v3.1 case fails if the predicate strips /v3.1 without /api, or
      // tries /api/v3 before /api/v3.1.
      expect(markdown.split(REST_VERSION_GUIDANCE)).toHaveLength(2);
      expect(markdown.split(TOOL_VERSION_GUIDANCE)).toHaveLength(2);
    },
  );

  test("renders both GET-by-slug version parameters with the v3.1 runtime default", async () => {
    const pathKey = "/api/v3.1/tools/{tool_slug}";
    bundledSpec = {
      paths: {
        [pathKey]: {
          get: {
            parameters: [
              { name: "version", in: "query", description: "Optional tool version" },
              {
                name: "toolkit_versions",
                in: "query",
                description: "Toolkit version specification",
              },
            ],
            responses: { 200: { description: "Success" } },
          },
        },
      },
    };

    const markdown = await openapiPageToMarkdown({
      url: "/reference/api-reference/tools/getToolsByToolSlug",
      data: {
        title: "Get tool",
        getOpenAPIPageProps: () => ({
          payload: { bundled: bundledSpec },
          operations: [{ path: pathKey, method: "GET" }],
        }),
      },
    });

    for (const parameter of ["version", "toolkit_versions"]) {
      const line = markdown
        .split("\n")
        .find(candidate => candidate.startsWith(`- \`${parameter}\``));
      expect(line).toContain("Defaults to `latest` when omitted on REST API v3.1.");
    }
  });

  test.each([
    [
      "v3.1 execute",
      "/reference/api-reference/tools/executeTool",
      "/api/v3.1/tools/execute/{tool_slug}",
      'Tool version to execute (defaults to "00000000_00" if not specified)',
      "latest",
      "3.1",
    ],
    [
      "v3.1 scopes",
      "/reference/api-reference/tools/getRequiredScopes",
      "/api/v3.1/tools/scopes/required",
      "Toolkit version to resolve scopes against. Defaults to the pinned HTTP version when omitted.",
      "latest",
      "3.1",
    ],
    [
      "v3 input generation",
      "/reference/v3/api-reference/tools/generateToolInputs",
      "/api/v3/tools/execute/{tool_slug}/input",
      'Tool version to use when generating inputs (defaults to "latest" if not specified)',
      "00000000_00",
      "3.0",
    ],
  ])(
    "replaces the stale %s request-body description",
    async (_label, pageUrl, pathKey, staleDescription, expectedDefault, apiVersion) => {
      bundledSpec = {
        paths: {
          [pathKey]: {
            post: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        version: { type: "string", description: staleDescription },
                      },
                    },
                  },
                },
              },
              responses: { 200: { description: "Success" } },
            },
          },
        },
      };

      const markdown = await openapiPageToMarkdown({
        url: pageUrl,
        data: {
          title: "Tool operation",
          getOpenAPIPageProps: () => ({
            payload: { bundled: bundledSpec },
            operations: [{ path: pathKey, method: "POST" }],
          }),
        },
      });
      const versionLine = markdown.split("\n").find(line => line.startsWith("- `version`"));

      expect(versionLine).toContain(
        `Defaults to \`${expectedDefault}\` when omitted on REST API v${apiVersion}.`
      );
      expect(versionLine).not.toContain(staleDescription);
    }
  );

  test("a non-tool endpoint carries the baseline and NOT the tool-version guidance", async () => {
    const markdown = await renderOperation(V31_PAGE, "/api/v3.1/auth_configs");

    expect(markdown).toContain(REST_VERSION_GUIDANCE);
    expect(markdown).not.toContain(TOOL_VERSION_GUIDANCE);
  });

  test("a near-miss endpoint under /tools behaves like a non-tool endpoint", async () => {
    // Under /tools, not one of the five — the case a prefix match gets wrong.
    const markdown = await renderOperation(
      "/reference/api-reference/tools/getToolsEnum",
      "/api/v3.1/tools/enum",
    );

    expect(markdown).toContain(REST_VERSION_GUIDANCE);
    expect(markdown).not.toContain(TOOL_VERSION_GUIDANCE);
  });

  test("neither page pulls in SESSION_GUARDRAILS", async () => {
    // SESSION_GUARDRAILS composes TOOL_VERSION_GUIDANCE. If an operation page
    // ever appended it, the tool-version text would arrive on every non-tool
    // page through the back door and the scoping above would be theatre.
    for (const [pageUrl, pathKey] of [
      [V31_PAGE, "/api/v3.1/auth_configs"],
      [V30_PAGE, "/api/v3/auth_configs"],
    ]) {
      const markdown = await renderOperation(pageUrl, pathKey);
      expect(markdown).not.toContain(SESSION_GUARDRAILS);
      expect(markdown).not.toContain("Instructions for AI Code Generators");
    }
  });
});

describe("LLM page degradation", () => {
  test("keeps a readable response when typed page parsing fails", () => {
    expect(
      degradedPageToMarkdown({
        url: "/docs/example",
        data: { title: 42, description: "Fallback copy" },
      })
    ).toBe("# 42 (/docs/example)\n\nFallback copy");
  });
});
