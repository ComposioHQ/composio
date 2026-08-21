/**
 * Regression tests for the raw-API-to-Toolkit transformation in
 * scripts/generate-toolkits.ts.
 *
 * The zod-based rewrite of transformToolkit/authConfigFields/
 * transformAuthConfigField parses raw API payloads leniently and rebuilds the
 * toolkit catalog field by field, so these tests pin the shapes
 * public/data/toolkits.json is expected to carry (see toolkit-schema.test.ts
 * for the sibling API-schema coverage).
 *
 * Only the pure transforms are exercised here — fetchToolkits,
 * fetchToolsForToolkit, fetchTriggersForToolkit, fetchAuthConfigDetails, and
 * main() all perform network I/O and are intentionally not covered by this
 * suite.
 */
import { describe, test, expect } from "bun:test";
import {
  authConfigFields,
  parseNamedItems,
  parseToolkitsPage,
  shouldPublishToolkit,
  transformAuthConfigField,
  transformAuthConfigDetail,
  transformToolkit,
} from "../../scripts/generate-toolkits";
import { transformTool } from "../../scripts/generate-meta-tools";

describe("transformToolkit", () => {
  test("excludes the synthetic test_app catalog residue from public docs", () => {
    expect(shouldPublishToolkit({ slug: "test_app" })).toBe(false);
    expect(shouldPublishToolkit({ slug: "TEST_APP" })).toBe(false);
    expect(shouldPublishToolkit({ slug: "gmail" })).toBe(true);
  });

  test("maps a representative full toolkit object end to end", () => {
    const toolkit = transformToolkit({
      slug: "GITHUB",
      name: "GitHub",
      description: "toolkit-level description",
      meta: {
        logo: "https://logo.example/github.png",
        description: "meta description wins over toolkit description",
        categories: [{ name: "dev-tools" }, "productivity"],
      },
      auth_schemes: ["OAUTH2", "API_KEY", 123],
      composio_managed_auth_schemes: ["OAUTH2"],
      tool_count: 42,
      trigger_count: 3,
    });

    expect(toolkit.slug).toBe("github");
    expect(toolkit.name).toBe("GitHub");
    expect(toolkit.logo).toBe("https://logo.example/github.png");
    expect(toolkit.description).toBe("meta description wins over toolkit description");
    expect(toolkit.category).toBe("dev-tools");
    expect(toolkit.authSchemes).toEqual(["OAUTH2", "API_KEY"]);
    expect(toolkit.composioManagedAuthSchemes).toEqual(["OAUTH2"]);
    expect(toolkit.toolCount).toBe(42);
    expect(toolkit.triggerCount).toBe(3);
    expect(toolkit.version).toBeNull();
    expect(toolkit.tools).toEqual([]);
    expect(toolkit.triggers).toEqual([]);
  });

  test("slug is lowercased regardless of API casing", () => {
    const toolkit = transformToolkit({ slug: "SlAcK" });
    expect(toolkit.slug).toBe("slack");
  });

  test("falls back to logo/description/auth_schemes on toolkit root when meta is absent", () => {
    const toolkit = transformToolkit({
      slug: "notion",
      logo: "https://logo.example/notion.png",
      description: "root description",
      authSchemes: ["OAUTH2"],
      composioManagedAuthSchemes: ["OAUTH2"],
    });

    expect(toolkit.logo).toBe("https://logo.example/notion.png");
    expect(toolkit.description).toBe("root description");
    expect(toolkit.authSchemes).toEqual(["OAUTH2"]);
    expect(toolkit.composioManagedAuthSchemes).toEqual(["OAUTH2"]);
  });

  test("omits composioManagedAuthSchemes entirely when empty (not an empty array)", () => {
    const toolkit = transformToolkit({ slug: "test" });
    expect(toolkit).not.toHaveProperty("composioManagedAuthSchemes");
  });

  test("empty-string name falls back to the original-casing slug", () => {
    const toolkit = transformToolkit({ slug: "GitHub", name: "" });
    expect(toolkit.name).toBe("GitHub");
  });

  test("missing name falls back to the original-casing slug", () => {
    const toolkit = transformToolkit({ slug: "GitHub" });
    expect(toolkit.name).toBe("GitHub");
  });

  test("empty meta values fall back to root logo and description", () => {
    const toolkit = transformToolkit({
      slug: "github",
      logo: "https://logo.example/github.png",
      description: "root description",
      meta: { logo: "", description: "" },
    });

    expect(toolkit.logo).toBe("https://logo.example/github.png");
    expect(toolkit.description).toBe("root description");
  });

  test("non-string tool_count/trigger_count are dropped in favor of the numeric fallback", () => {
    const toolkit = transformToolkit({
      slug: "test",
      tool_count: "42",
      trigger_count: null,
    });
    expect(toolkit.toolCount).toBe(0);
    expect(toolkit.triggerCount).toBe(0);
  });

  test("non-string auth_schemes members are filtered out of the array", () => {
    const toolkit = transformToolkit({
      slug: "test",
      auth_schemes: ["OAUTH2", 42, null, "API_KEY", { scheme: "x" }],
    });
    expect(toolkit.authSchemes).toEqual(["OAUTH2", "API_KEY"]);
  });

  test("non-array auth_schemes yields an empty array, never a non-array value", () => {
    const toolkit = transformToolkit({ slug: "test", auth_schemes: "OAUTH2" });
    expect(Array.isArray(toolkit.authSchemes)).toBe(true);
    expect(toolkit.authSchemes).toEqual([]);
  });

  test("category falls back to null when the first category entry has no string name", () => {
    const toolkit = transformToolkit({
      slug: "test",
      meta: { categories: [{ notName: "x" }] },
    });
    expect(toolkit.category).toBeNull();
  });

  test("category is null when categories is absent or not an array", () => {
    expect(transformToolkit({ slug: "test" }).category).toBeNull();
    expect(transformToolkit({ slug: "test", meta: { categories: "dev-tools" } }).category).toBeNull();
  });

  test("empty category names fall back to null", () => {
    expect(transformToolkit({ slug: "test", meta: { categories: [""] } }).category).toBeNull();
    expect(
      transformToolkit({ slug: "test", meta: { categories: [{ name: "" }] } }).category
    ).toBeNull();
  });

  test("malformed/empty input objects do not throw", () => {
    expect(() => transformToolkit({})).not.toThrow();
    expect(() => transformToolkit(null)).not.toThrow();
    expect(() => transformToolkit(undefined)).not.toThrow();
    expect(() => transformToolkit("not-an-object")).not.toThrow();
    expect(() => transformToolkit(42)).not.toThrow();
    expect(() => transformToolkit([])).not.toThrow();

    const toolkit = transformToolkit(null);
    expect(toolkit.slug).toBe("");
    expect(toolkit.name).toBe("");
    expect(toolkit.logo).toBeNull();
    expect(toolkit.description).toBe("");
    expect(toolkit.authSchemes).toEqual([]);
    expect(toolkit.toolCount).toBe(0);
    expect(toolkit.triggerCount).toBe(0);
  });
});

describe("transformAuthConfigField", () => {
  test("maps a representative required field", () => {
    const field = transformAuthConfigField(
      {
        name: "api_key",
        displayName: "API Key",
        type: "string",
        description: "Your API key",
        required: true,
        default: "fallback-value",
      },
      false
    );

    expect(field).toEqual({
      name: "api_key",
      displayName: "API Key",
      type: "string",
      description: "Your API key",
      required: true,
      default: "fallback-value",
    });
  });

  test("displayName falls back to name when absent", () => {
    const field = transformAuthConfigField({ name: "client_id" }, true);
    expect(field.displayName).toBe("client_id");
  });

  test("empty displayName falls back to name", () => {
    const field = transformAuthConfigField({ name: "client_id", displayName: "" }, true);
    expect(field.displayName).toBe("client_id");
  });

  test("required falls back to the caller-supplied requirement when the API omits it", () => {
    const required = transformAuthConfigField({ name: "x" }, true);
    const optional = transformAuthConfigField({ name: "x" }, false);
    expect(required.required).toBe(true);
    expect(optional.required).toBe(false);
  });

  test("type defaults to 'string' when missing or non-string", () => {
    expect(transformAuthConfigField({ name: "x" }, false).type).toBe("string");
    expect(transformAuthConfigField({ name: "x", type: 7 }, false).type).toBe("string");
  });

  test("scalar defaults are preserved as strings while structured values are dropped", () => {
    expect(transformAuthConfigField({ name: "x", default: 5 }, false).default).toBe("5");
    expect(transformAuthConfigField({ name: "x", default: false }, false).default).toBe("false");
    expect(transformAuthConfigField({ name: "x", default: { a: 1 } }, false).default).toBeNull();
    expect(transformAuthConfigField({ name: "x", default: ["a"] }, false).default).toBeNull();
    expect(transformAuthConfigField({ name: "x", default: null }, false).default).toBeNull();
    expect(transformAuthConfigField({ name: "x" }, false).default).toBeNull();
  });

  test("malformed/empty input does not throw", () => {
    expect(() => transformAuthConfigField(null, false)).not.toThrow();
    expect(() => transformAuthConfigField(undefined, true)).not.toThrow();
    expect(() => transformAuthConfigField("nope", false)).not.toThrow();
    expect(() => transformAuthConfigField(42, false)).not.toThrow();

    const field = transformAuthConfigField(null, true);
    expect(field.name).toBe("");
    expect(field.displayName).toBe("");
    expect(field.type).toBe("string");
    expect(field.description).toBe("");
    expect(field.required).toBe(true);
    expect(field.default).toBeNull();
  });
});

describe("transformAuthConfigDetail", () => {
  test("empty names fall back to the auth mode", () => {
    const detail = transformAuthConfigDetail({ mode: "oauth2", name: "" });
    expect(detail?.name).toBe("oauth2");
  });

  test("non-object entries are dropped", () => {
    expect(transformAuthConfigDetail(null)).toBeNull();
    expect(transformAuthConfigDetail("oauth2")).toBeNull();
  });
});

describe("authConfigFields", () => {
  const rawAuthConfig = {
    fields: {
      auth_config_creation: {
        required: [{ name: "client_id" }, { name: "client_secret" }],
        optional: [{ name: "redirect_url" }],
      },
      connected_account_initiation: {
        required: [{ name: "code" }],
        optional: "not-an-array",
      },
    },
  };

  test("extracts the required/optional field lists for a given phase", () => {
    const required = authConfigFields(rawAuthConfig, "auth_config_creation", "required");
    const optional = authConfigFields(rawAuthConfig, "auth_config_creation", "optional");

    expect(required.map(f => f.name)).toEqual(["client_id", "client_secret"]);
    expect(required.every(f => f.required)).toBe(true);
    expect(optional.map(f => f.name)).toEqual(["redirect_url"]);
    expect(optional.every(f => f.required)).toBe(false);
  });

  test("non-array requirement lists always yield an array, never throwing", () => {
    const optional = authConfigFields(rawAuthConfig, "connected_account_initiation", "optional");
    expect(Array.isArray(optional)).toBe(true);
    expect(optional).toEqual([]);
  });

  test("malformed/empty input objects do not throw and yield an empty array", () => {
    expect(() => authConfigFields({}, "auth_config_creation", "required")).not.toThrow();
    expect(authConfigFields({}, "auth_config_creation", "required")).toEqual([]);
    expect(authConfigFields({ fields: null }, "auth_config_creation", "required")).toEqual([]);
  });
});

// generate-meta-tools.ts's transformTool is a cheap, pure sibling transform
// built on the same lenient zod parsing; a couple of cases here mirror the
// coverage above without pulling in createSession/fetchMetaTools (network).
describe("transformTool (generate-meta-tools.ts)", () => {
  test("maps a representative full meta tool object end to end", () => {
    const tool = transformTool({
      slug: "COMPOSIO_SEARCH_TOOLS",
      name: "composio_search_tools",
      description: "Searches for tools",
      tags: ["discovery", "search", 42],
      toolkit: "meta",
      input_parameters: { type: "object" },
      output_parameters: { type: "object" },
    });

    expect(tool.slug).toBe("COMPOSIO_SEARCH_TOOLS");
    expect(tool.name).toBe("composio_search_tools");
    expect(tool.displayName).toBe("Composio Search Tools");
    expect(tool.description).toBe("Searches for tools");
    expect(tool.tags).toEqual(["discovery", "search"]);
    expect(tool.toolkit).toBe("meta");
    expect(tool.inputParameters).toEqual({ type: "object" });
    expect(tool.responseSchema).toEqual({ type: "object" });
  });

  test("toolkit falls back to null when absent or non-string", () => {
    expect(transformTool({ slug: "x", name: "x" }).toolkit).toBeNull();
    expect(transformTool({ slug: "x", name: "x", toolkit: "" }).toolkit).toBeNull();
    expect(transformTool({ slug: "x", name: "x", toolkit: 7 }).toolkit).toBeNull();
  });

  test("displayName falls back to the slug when name is empty", () => {
    const tool = transformTool({ slug: "COMPOSIO_X", name: "" });
    expect(tool.displayName).toBe("COMPOSIO_X");
  });

  test("malformed/empty input objects do not throw", () => {
    expect(() => transformTool({})).not.toThrow();
    expect(() => transformTool(null)).not.toThrow();
    expect(() => transformTool(undefined)).not.toThrow();

    const tool = transformTool({});
    expect(tool.slug).toBe("");
    expect(tool.name).toBe("");
    expect(tool.displayName).toBe("");
    expect(tool.tags).toEqual([]);
    expect(tool.toolkit).toBeNull();
    expect(tool.inputParameters).toEqual({});
    expect(tool.responseSchema).toEqual({});
  });
});

describe("parseToolkitsPage", () => {
  test("rejects malformed page envelopes instead of returning an empty page", () => {
    expect(() => parseToolkitsPage({ error: "rate limited" })).toThrow();
    expect(() => parseToolkitsPage({ items: null })).toThrow();
    expect(() => parseToolkitsPage("not a page")).toThrow();
  });
});

describe("parseNamedItems", () => {
  test("empty names fall back to display names", () => {
    expect(
      parseNamedItems([
        {
          slug: "GMAIL_SEND_EMAIL",
          name: "",
          display_name: "Send email",
          description: "Sends an email",
        },
      ])[0]?.name
    ).toBe("Send email");
  });
});
