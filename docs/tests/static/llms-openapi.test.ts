import { beforeAll, describe, expect, mock, test } from "bun:test";

let dereferencedSpec: Record<string, unknown> = {};

mock.module("@/lib/source", () => ({
  source: {},
  getReferenceSource: async () => ({}),
  examplesSource: {},
  toolkitsSource: {},
  changelogEntries: [],
  slugToDate: () => null,
  formatDate: () => "",
  getLLMText: async () => "",
  mdxToCleanMarkdown: async () => "",
}));
mock.module("@/lib/openapi", () => ({
  openapi: {
    getSchema: async () => ({ dereferenced: dereferencedSpec }),
  },
}));
mock.module("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  usePathname: () => "/reference/api-reference/tasks",
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
  processSchema: (schema: unknown) => schema,
  toolFromApi: (tool: unknown) => tool,
}));

let openapiPageToMarkdown: typeof import("../../app/llms.mdx/[[...slug]]/route").openapiPageToMarkdown;

beforeAll(async () => {
  ({ openapiPageToMarkdown } = await import(
    "../../app/llms.mdx/[[...slug]]/route"
  ));
});

describe("LLM OpenAPI markdown", () => {
  test("continues to render API operations with endpoint and cURL details", async () => {
    dereferencedSpec = {
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
        getAPIPageProps: () => ({
          document: "/openapi.json",
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
    dereferencedSpec = {
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
        getAPIPageProps: () => ({
          document: "/openapi-webhooks.json",
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
});
