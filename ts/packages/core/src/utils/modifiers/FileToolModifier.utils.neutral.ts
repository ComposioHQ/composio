import type { JSONSchemaProperty } from '../../types/tool.types';

// Helper function to recognise plain objects
export function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Transforms a single JSON schema property, recursively handling nested properties,
 * anyOf, oneOf, and allOf.
 */
const transformSchema = (property: JSONSchemaProperty): JSONSchemaProperty => {
  if (property.file_uploadable) {
    // Transform file-uploadable property
    return {
      title: property.title,
      description: property.description,
      format: 'path',
      type: 'string',
      file_uploadable: true,
    };
  }

  const newProperty = { ...property };

  if (property.type === 'object' && property.properties) {
    // Recursively transform nested properties
    newProperty.properties = transformProperties(property.properties);
  }

  if (property.anyOf) {
    newProperty.anyOf = property.anyOf.map(transformSchema);
  }

  if (property.oneOf) {
    newProperty.oneOf = property.oneOf.map(transformSchema);
  }

  if (property.allOf) {
    newProperty.allOf = property.allOf.map(transformSchema);
  }

  if (property.items) {
    if (Array.isArray(property.items)) {
      newProperty.items = property.items.map(transformSchema);
    } else {
      newProperty.items = transformSchema(property.items);
    }
  }

  return newProperty;
};

/**
 * Transforms the properties of the tool schema to include the file upload URL.
 *
 * Attaches the format: 'path' to the properties that are file uploadable for agents.
 *
 * @param properties - The properties of the tool schema.
 * @returns The transformed properties.
 */
export const transformProperties = (properties: JSONSchemaProperty): JSONSchemaProperty => {
  const newProperties: JSONSchemaProperty = {};

  for (const [key, property] of Object.entries(properties) as [string, JSONSchemaProperty][]) {
    newProperties[key] = transformSchema(property);
  }

  return newProperties;
};

/**
 * Recursively checks if a schema (or any of its variants) contains a specific file property.
 */
export const schemaHasFileProperty = (
  schema: JSONSchemaProperty | undefined,
  property: 'file_uploadable' | 'file_downloadable'
): boolean => {
  if (!schema) return false;
  if (schema[property]) return true;

  // Check nested properties
  if (schema.properties) {
    for (const prop of Object.values(schema.properties) as JSONSchemaProperty[]) {
      if (schemaHasFileProperty(prop, property)) return true;
    }
  }

  // Check anyOf/oneOf/allOf variants
  if (schema.anyOf) {
    for (const variant of schema.anyOf) {
      if (schemaHasFileProperty(variant, property)) return true;
    }
  }
  if (schema.oneOf) {
    for (const variant of schema.oneOf) {
      if (schemaHasFileProperty(variant, property)) return true;
    }
  }
  if (schema.allOf) {
    for (const variant of schema.allOf) {
      if (schemaHasFileProperty(variant, property)) return true;
    }
  }

  // Check array items
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      for (const item of schema.items) {
        if (schemaHasFileProperty(item, property)) return true;
      }
    } else {
      if (schemaHasFileProperty(schema.items, property)) return true;
    }
  }

  return false;
};

/**
 * Recursively checks if a schema (or any of its variants) contains file_uploadable properties.
 */
export const schemaHasFileUploadable = (schema: JSONSchemaProperty | undefined): boolean => {
  return schemaHasFileProperty(schema, 'file_uploadable');
};

/**
 * Recursively checks if a schema (or any of its variants) contains file_downloadable properties.
 */
export const schemaHasFileDownloadable = (schema: JSONSchemaProperty | undefined): boolean => {
  return schemaHasFileProperty(schema, 'file_downloadable');
};
