import z from "zod";

type SchemaTypeToTsType = {
    [key: string]: any;
};

const SCHEMA_TYPE_TO_TS_TYPE: SchemaTypeToTsType = {
    "string": String,
    "number": Number,
    "boolean": Boolean,
    "integer": Number,
};

const PYDANTIC_TYPE_TO_TS_TYPE: SchemaTypeToTsType = {
    "string": String,
    "integer": Number,
    "number": Number,
    "boolean": Boolean,
    "null": null,
};

const FALLBACK_VALUES: SchemaTypeToTsType = {
    "string": "",
    "number": 0.0,
    "integer": 0,
    "boolean": false,
    "object": {},
    "array": [],
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
            default: required.includes(name) ? undefined : null,
        },
    ];
}


export function jsonSchemaToModel(jsonSchema: Record<string, any>): any {
    const properties = jsonSchema.properties;
    if (!properties) {
        return z.object({});
    }

    const zodSchema: Record<string, any> = {};
    for (const [key, _] of Object.entries(properties)) {
        const value = _ as any;
        let zodType;
        switch (value.type) {
            case "string":
                zodType = z.string().describe((value.description || "") + (value.examples ? `\nExamples: ${value.examples.join(", ")}` : ""));
                break;
            case "number":
                zodType = z.number().describe((value.description || "") + (value.examples ? `\nExamples: ${value.examples.join(", ")}` : ""));
                break;
            case "integer":
                zodType = z.number().int().describe((value.description || "") + (value.examples ? `\nExamples: ${value.examples.join(", ")}` : ""));
                break;
            case "boolean":
                zodType = z.boolean().describe((value.description || "") + (value.examples ? `\nExamples: ${value.examples.join(", ")}` : ""));
                break;
            case "array":
                zodType = z.array(jsonSchemaToModel(value.items)).describe((value.description || "") + (value.examples ? `\nExamples: ${value.examples.join(", ")}` : ""));
                break;
            case "object":
                zodType = jsonSchemaToModel(value).describe((value.description || "") + (value.examples ? `\nExamples: ${value.examples.join(", ")}` : ""));
                break;
            default:
                throw new Error(`Unsupported JSON schema type: ${value.type}`);
        }

        if (value.description) {
            zodType = zodType.describe(value.description);
        }

        zodSchema[key] = zodType;
    }

    return z.object(zodSchema);
}
