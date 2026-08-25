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
export const transformProperties = (
  properties: Record<string, JSONSchemaProperty>
): Record<string, JSONSchemaProperty> => {
  const newProperties: Record<string, JSONSchemaProperty> = {};

  for (const [key, property] of Object.entries(properties)) {
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
    for (const prop of Object.values(schema.properties)) {
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

  // Check `$ref` targets. Composio toolkits routinely express file flags
  // through a `$ref`/`$defs` indirection (e.g. GMAIL_GET_ATTACHMENT), and
  // this predicate is the cheap gate that decides whether a schema is worth
  // dereferencing at all — without this it answers `false` for every
  // ref-based schema. Callers walk the *dereferenced* schema, where
  // `dereferenceJsonSchema` has already stripped these blocks, so an unused
  // `$defs` entry can only cost a redundant walk, never a wrong upload.
  for (const definitions of [schema.$defs, schema.definitions]) {
    if (!definitions) continue;
    for (const definition of Object.values(definitions)) {
      if (schemaHasFileProperty(definition, property)) return true;
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

/**
 * Sentinel a leaf handler returns to have {@link walkFileUploadableLeaves}
 * omit that key/item from its parent container. `''` and `null` are legal
 * payload values, so neither can double as "remove this".
 */
export const DELETE_VALUE: unique symbol = Symbol('composio.delete-value');

/**
 * `''` at a `file_uploadable` leaf means "no file": it is never a staged
 * `{ name, mimetype, s3key }` descriptor, so the backend rejects it with a
 * validation error, while callers (and the playground UI) mean "absent". The
 * walker omits the key instead. `null` is left alone — schemas with a `null`
 * variant accept it, and the backend reports the mismatch otherwise.
 */
export const isEmptyFileValue = (value: unknown): boolean => value === '';

export const getSchemaVariants = (schema: JSONSchemaProperty | undefined): JSONSchemaProperty[] => [
  ...(schema?.anyOf ?? []),
  ...(schema?.oneOf ?? []),
  ...(schema?.allOf ?? []),
];

/** Best-effort runtime shape match for selecting composed schema variants. */
export const jsonSchemaTypeMatchesValue = (schema: JSONSchemaProperty, value: unknown): boolean => {
  const schemaType = schema.type;

  if (Array.isArray(schemaType)) {
    return schemaType.some(type => jsonSchemaTypeMatchesValue({ ...schema, type }, value));
  }

  if (schemaType === undefined) {
    if (schema.properties) return isPlainObject(value);
    if (schema.items) return Array.isArray(value);
    return false;
  }

  switch (schemaType) {
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
};

/** Mirrors the array-shape inference used by {@link jsonSchemaTypeMatchesValue}. */
const isArrayShapedSchema = (schema: JSONSchemaProperty | undefined): boolean => {
  if (!schema) return false;
  if (Array.isArray(schema.type)) return schema.type.includes('array');
  return schema.type === 'array' || (schema.type === undefined && schema.items !== undefined);
};

/** Mirrors the object-shape inference used by {@link jsonSchemaTypeMatchesValue}. */
const isObjectShapedSchema = (schema: JSONSchemaProperty | undefined): boolean => {
  if (!schema) return false;
  if (Array.isArray(schema.type)) return schema.type.includes('object');
  return schema.type === 'object' || (schema.type === undefined && schema.properties !== undefined);
};

/**
 * Picks the file-bearing `anyOf`/`oneOf`/`allOf` variant whose JSON Schema
 * shape matches the runtime value, falling back to the first file-bearing
 * variant to preserve historical behavior.
 */
export const findSchemaVariantWithFileProperty = (
  schema: JSONSchemaProperty | undefined,
  property: 'file_uploadable' | 'file_downloadable',
  value: unknown
): JSONSchemaProperty | undefined => {
  const candidates = getSchemaVariants(schema).filter(variant =>
    schemaHasFileProperty(variant, property)
  );

  return (
    candidates.find(candidate => jsonSchemaTypeMatchesValue(candidate, value)) ?? candidates[0]
  );
};

/**
 * Recursively walks a runtime value alongside its (already dereferenced)
 * JSON-Schema node and passes every value sitting at a `file_uploadable`
 * node through `leaf`. A leaf returning {@link DELETE_VALUE} is omitted from
 * its parent object/array. Returns a **new** value; nothing is mutated.
 *
 * Composed schemas are resolved to the single file-bearing variant whose
 * shape matches the value: with `oneOf`, exactly one variant should apply at
 * runtime, and applying several would stage the same file once per variant.
 */
export const walkFileUploadableLeaves = async (
  value: unknown,
  schema: JSONSchemaProperty | undefined,
  leaf: (value: unknown) => Promise<unknown>
): Promise<unknown> => {
  if (schema?.file_uploadable) {
    return leaf(value);
  }

  const uploadableVariant = findSchemaVariantWithFileProperty(schema, 'file_uploadable', value);
  if (uploadableVariant) {
    // A scalar empty string cannot match an array-only file input, but callers
    // use it to mean "no files". Route it through the leaf handler so it is
    // omitted, unless another non-file variant explicitly accepts strings.
    const matchingNonFileVariant = getSchemaVariants(schema).some(
      variant =>
        !schemaHasFileProperty(variant, 'file_uploadable') &&
        jsonSchemaTypeMatchesValue(variant, value)
    );
    if (
      isEmptyFileValue(value) &&
      isArrayShapedSchema(uploadableVariant) &&
      !matchingNonFileVariant
    ) {
      return leaf(value);
    }
    return walkFileUploadableLeaves(value, uploadableVariant, leaf);
  }

  if (
    isEmptyFileValue(value) &&
    isArrayShapedSchema(schema) &&
    schemaHasFileProperty(schema, 'file_uploadable')
  ) {
    return leaf(value);
  }

  if (isObjectShapedSchema(schema) && schema?.properties && isPlainObject(value)) {
    const transformed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const propertySchema = Object.hasOwn(schema.properties, k) ? schema.properties[k] : undefined;
      const walked = await walkFileUploadableLeaves(v, propertySchema, leaf);
      if (walked !== DELETE_VALUE) {
        // Define every key as an own data property so reserved JSON keys such
        // as `__proto__` remain enumerable without invoking its inherited
        // setter and changing this ordinary object's prototype.
        Object.defineProperty(transformed, k, {
          configurable: true,
          enumerable: true,
          value: walked,
          writable: true,
        });
      }
    }
    return transformed;
  }

  if (isArrayShapedSchema(schema) && schema?.items && Array.isArray(value)) {
    // `items` can be a single schema or an array of schemas; we handle both.
    const itemSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items;
    const walked = await Promise.all(
      value.map(item => walkFileUploadableLeaves(item, itemSchema as JSONSchemaProperty, leaf))
    );
    return walked.filter(item => item !== DELETE_VALUE);
  }

  return value;
};

/**
 * Omits `''` at `file_uploadable` leaves of `args` without uploading
 * anything. This is the schema-aware half of the upload modifier that needs
 * no filesystem access, so it also runs when automatic upload is disabled:
 * an empty file value is never a valid staged descriptor and the backend
 * would reject it (https://github.com/ComposioHQ/composio/issues/4233).
 * Any other value — a local path, a staged descriptor, a list — is
 * forwarded untouched.
 */
export const dropEmptyFileUploads = (
  args: Record<string, unknown>,
  schema: JSONSchemaProperty | undefined
): Promise<unknown> =>
  walkFileUploadableLeaves(args, schema, async value =>
    isEmptyFileValue(value) ? DELETE_VALUE : value
  );
