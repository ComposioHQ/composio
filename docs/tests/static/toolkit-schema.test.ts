/**
 * Regression tests for the raw-API-to-ParameterSchema transformation.
 *
 * The unknown-narrowing rewrite of processSchema/processParams rebuilds
 * nodes field by field, so these tests pin the shapes the toolkit detail
 * UI depends on (toolkit-detail.tsx reads additionalProperties and
 * items.additionalProperties, including their nested properties, to
 * synthesize the "[key: string]" row).
 */
import { describe, test, expect } from "bun:test";
import { processSchema, toolFromApi } from "../../lib/toolkit-schema";

describe("processSchema", () => {
  test("dictionary-of-object param keeps nested additionalProperties subschema", () => {
    const params = processSchema({
      type: "object",
      properties: {
        metadata: {
          type: "object",
          additionalProperties: {
            type: "object",
            required: ["label"],
            properties: {
              label: { type: "string", description: "Display label" },
              weight: { type: "number" },
            },
          },
        },
      },
    });

    const additional = params?.metadata.additionalProperties;
    expect(additional).toBeDefined();
    expect(typeof additional).toBe("object");
    if (typeof additional === "object") {
      expect(additional.type).toBe("object");
      expect(additional.requiredFields).toEqual(["label"]);
      expect(additional.properties?.label.type).toBe("string");
      expect(additional.properties?.label.description).toBe("Display label");
      expect(additional.properties?.weight.type).toBe("number");
    }
  });

  test("array-of-dictionary param keeps items.additionalProperties", () => {
    const params = processSchema({
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: { type: "string", description: "cell value" },
          },
        },
      },
    });

    const itemsAdditional = params?.rows.items?.additionalProperties;
    expect(itemsAdditional).toBeDefined();
    expect(typeof itemsAdditional).toBe("object");
    if (typeof itemsAdditional === "object") {
      expect(itemsAdditional.type).toBe("string");
      expect(itemsAdditional.description).toBe("cell value");
    }
  });

  test("boolean additionalProperties passes through unchanged", () => {
    const params = processSchema({
      type: "object",
      properties: {
        strict: { type: "object", additionalProperties: false },
      },
    });

    expect(params?.strict.additionalProperties).toBe(false);
  });

  test("array items keep the required-to-requiredFields remap and nested properties", () => {
    const params = processSchema({
      type: "object",
      required: ["records"],
      properties: {
        records: {
          type: "array",
          items: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
              note: { type: "string" },
            },
          },
        },
      },
    });

    expect(params?.records.required).toBe(true);
    expect(params?.records.items?.requiredFields).toEqual(["id"]);
    expect(params?.records.items?.properties?.id.type).toBe("string");
  });

  test("tuple-form items array is not spread into numeric keys", () => {
    const params = processSchema({
      type: "object",
      properties: {
        pair: { type: "array", items: [{ type: "string" }, { type: "number" }] },
      },
    });

    expect(params?.pair.items).toBeUndefined();
  });
});

describe("toolFromApi", () => {
  test("maps slug fallback and nested schemas end to end", () => {
    const tool = toolFromApi({
      slug: "TEST_TOOL",
      description: "A test tool",
      input_parameters: {
        type: "object",
        properties: {
          config: {
            type: "object",
            additionalProperties: {
              type: "object",
              properties: { enabled: { type: "boolean" } },
            },
          },
        },
      },
    });

    expect(tool.name).toBe("TEST_TOOL");
    const additional = tool.input_parameters?.config.additionalProperties;
    expect(typeof additional).toBe("object");
    if (typeof additional === "object") {
      expect(additional.properties?.enabled.type).toBe("boolean");
    }
  });
});
