import z from "zod";
import logger from "./logger";

type SchemaTypeToTsType = {
  [key: string]: any;
};

const PYDANTIC_TYPE_TO_TS_TYPE: SchemaTypeToTsType = {
  string: String,
  integer: Number,
  number: Number,
  boolean: Boolean,
  null: null,
};

export function jsonSchemaToTsType(jsonSchema: Record<string, any>): any {
  if (!jsonSchema.type) {
    jsonSchema.type = "string";
  }
  const type = jsonSchema.type as string;

  if (type === "array") {
    const itemsSchema = jsonSchema.items;
    if (itemsSchema) {
      const ItemType = jsonSchemaToTsType(itemsSchema);
      return ItemType;
    }
    return Array;
  }

  if (type === "object") {
    const properties = jsonSchema.properties;
    if (properties) {
      const nestedModel = jsonSchemaToModel(jsonSchema);
      return nestedModel;
    }
    return Object;
  }

  const tsType = PYDANTIC_TYPE_TO_TS_TYPE[type];
  if (tsType !== undefined) {
    return tsType;
  }

  throw new Error(`Unsupported JSON schema type: ${type}`);
}

export function jsonSchemaToTsField(
  name: string,
  jsonSchema: Record<string, any>,
  required: string[]
): [any, any] {
  const description = jsonSchema.description;
  const examples = jsonSchema.examples || [];
  return [
    jsonSchemaToTsType(jsonSchema),
    {
      description: description,
      examples: examples,
      required: required.includes(name),
      default: required.includes(name) ? undefined : null,
    },
  ];
}

function jsonSchemaPropertiesToTSTypes(value: any): z.ZodTypeAny {
  if (!value.type) {
    return z.object({});
  }

  let zodType;
  switch (value.type) {
    case "string":
      zodType = z
        .string()
        .describe(
          (value.description || "") +
            (value.examples ? `\nExamples: ${value.examples.join(", ")}` : "")
        );
      break;
    case "number":
      zodType = z
        .number()
        .describe(
          (value.description || "") +
            (value.examples ? `\nExamples: ${value.examples.join(", ")}` : "")
        );
      break;
    case "integer":
      zodType = z
        .number()
        .int()
        .describe(
          (value.description || "") +
            (value.examples ? `\nExamples: ${value.examples.join(", ")}` : "")
        );
      break;
    case "boolean":
      zodType = z
        .boolean()
        .describe(
          (value.description || "") +
            (value.examples ? `\nExamples: ${value.examples.join(", ")}` : "")
        );
      break;
    case "array":
      zodType = z
        .array(jsonSchemaPropertiesToTSTypes(value.items))
        .describe(
          (value.description || "") +
            (value.examples ? `\nExamples: ${value.examples.join(", ")}` : "")
        );
      break;
    case "object":
      zodType = jsonSchemaToModel(value).describe(
        (value.description || "") +
          (value.examples ? `\nExamples: ${value.examples.join(", ")}` : "")
      );
      break;
    case "null":
      zodType = z.null().describe(value.description || "");
      break;
    default:
      throw new Error(`Unsupported JSON schema type: ${value.type}`);
  }

  return zodType;
}

export function jsonSchemaToModel(
  jsonSchema: Record<string, any>
): z.ZodObject<any> {
  const properties = jsonSchema.properties;
  const requiredFields = jsonSchema.required || [];
  if (!properties) {
    return z.object({});
  }

  const zodSchema: Record<string, any> = {};
  for (const [key, _] of Object.entries(properties)) {
    const value = _ as any;
    let zodType;
    if (value.anyOf) {
      const anyOfTypes = value.anyOf.map((schema: any) =>
        jsonSchemaPropertiesToTSTypes(schema)
      );
      zodType = z
        .union(anyOfTypes)
        .describe(
          (value.description || "") +
            (value.examples ? `\nExamples: ${value.examples.join(", ")}` : "")
        );
    } else if (value.allOf) {
      const allOfTypes = value.allOf.map((schema: any) =>
        jsonSchemaPropertiesToTSTypes(schema)
      );
      zodType = z
        .intersection(
          allOfTypes[0],
          allOfTypes
            .slice(1)
            .reduce(
              (acc: z.ZodTypeAny, schema: z.ZodTypeAny) => acc.and(schema),
              allOfTypes[0]
            )
        )
        .describe(
          (value.description || "") +
            (value.examples ? `\nExamples: ${value.examples.join(", ")}` : "")
        );
    } else {
      if (!value.type) {
        value.type = "string";
      }
      zodType = jsonSchemaPropertiesToTSTypes(value);
    }

    if (value.description) {
      zodType = zodType.describe(value.description);
    }

    if (requiredFields.includes(key)) {
      zodSchema[key] = zodType;
    } else {
      zodSchema[key] = zodType.optional();
    }
  }

  return z.object(zodSchema);
}

export const getEnvVariable = (
  name: string,
  defaultValue: string | undefined = undefined
): string | undefined => {
  try {
    return process.env[name] || defaultValue;
  } catch (_e) {
    return defaultValue;
  }
};

export const nodeExternalRequire = (name: string) => {
  try {
    if (typeof process !== "undefined") {
      return require(name);
    } else {
      return require(`external:${name}`);
    }
  } catch (err) {
    return null;
  }
};
