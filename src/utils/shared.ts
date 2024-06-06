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
    const modelName = jsonSchema.title;
    const fieldDefinitions: Record<string, any> = {};

    for (const [name, prop] of Object.entries(jsonSchema.properties || {})) {
        fieldDefinitions[name] = jsonSchemaToTsField(name, prop as any, jsonSchema.required || []);
    }

    return class {
        static modelName = modelName;
        static fields = fieldDefinitions;
    };
}
