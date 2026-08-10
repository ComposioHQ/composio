import { dereference, Validator } from '@cfworker/json-schema';
import type { OutputUnit, Schema as InterpreterSchema, SchemaDraft } from '@cfworker/json-schema';
import { Schema } from 'effect';

export type JsonSchemaValidationIssue = {
  readonly code: string;
  readonly keys?: ReadonlyArray<string>;
  readonly message: string;
  readonly path: ReadonlyArray<PropertyKey>;
};

export type JsonSchemaToEffectSchemaOptions = {
  readonly draft?: SchemaDraft;
  readonly formatIssues?: (
    issues: ReadonlyArray<JsonSchemaValidationIssue>
  ) => ReadonlyArray<string>;
};

type JsonObject = Record<string, unknown>;

const BASE64_PATTERN = '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$';

const schemaMapKeywords = new Set([
  '$defs',
  'definitions',
  'dependentSchemas',
  'patternProperties',
  'properties',
]);

const schemaArrayKeywords = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);

const schemaValueKeywords = new Set([
  'additionalItems',
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties',
]);

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isObjectSchema = (schema: JsonObject): boolean =>
  schema.type === 'object' ||
  'properties' in schema ||
  'patternProperties' in schema ||
  'additionalProperties' in schema;

const hasNamedProperties = (schema: JsonObject): boolean =>
  isJsonObject(schema.properties) && Object.keys(schema.properties).length > 0;

const appendAllOf = (schema: JsonObject, constraint: JsonObject): void => {
  const current = schema.allOf;
  schema.allOf = Array.isArray(current) ? [...current, constraint] : [constraint];
};

const normalizeBounds = (schema: JsonObject): void => {
  const type = schema.type;
  const minimum = schema.min;
  const maximum = schema.max;

  if (typeof minimum === 'number') {
    if ((type === 'number' || type === 'integer') && schema.minimum === undefined) {
      schema.minimum = minimum;
    } else if (type === 'string' && schema.minLength === undefined) {
      schema.minLength = minimum;
    } else if (type === 'array' && schema.minItems === undefined) {
      schema.minItems = minimum;
    }
  }

  if (typeof maximum === 'number') {
    if ((type === 'number' || type === 'integer') && schema.maximum === undefined) {
      schema.maximum = maximum;
    } else if (type === 'string' && schema.maxLength === undefined) {
      schema.maxLength = maximum;
    } else if (type === 'array' && schema.maxItems === undefined) {
      schema.maxItems = maximum;
    }
  }
};

const normalizeFormats = (schema: JsonObject): void => {
  if (schema.type === 'number' && schema.format === 'int64') {
    schema.type = 'integer';
  }

  if (schema.type !== 'string') {
    return;
  }

  if (schema.format === 'binary' || schema.contentEncoding !== undefined) {
    if (schema.pattern === undefined) {
      schema.pattern = BASE64_PATTERN;
    } else {
      appendAllOf(schema, { pattern: BASE64_PATTERN });
    }
  }

  if (schema.format === 'ip') {
    delete schema.format;
    appendAllOf(schema, {
      anyOf: [{ format: 'ipv4' }, { format: 'ipv6' }],
    });
  }
};

const normalizeNullable = (schema: JsonObject): JsonObject => {
  if (schema.nullable !== true) {
    return schema;
  }

  delete schema.nullable;
  if (typeof schema.type === 'string') {
    schema.type = [schema.type, 'null'];
    return schema;
  }
  if (Array.isArray(schema.type)) {
    schema.type = schema.type.includes('null') ? schema.type : [...schema.type, 'null'];
    return schema;
  }

  return { anyOf: [schema, { type: 'null' }] };
};

const normalizeSchemaNode = (
  value: unknown,
  seen: WeakMap<object, InterpreterSchema | boolean>
): InterpreterSchema | boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (!isJsonObject(value)) {
    return true;
  }

  const existing = seen.get(value);
  if (existing) {
    return existing;
  }

  const normalized: JsonObject = {};
  seen.set(value, normalized as InterpreterSchema);

  for (const [key, child] of Object.entries(value)) {
    if (schemaMapKeywords.has(key) && isJsonObject(child)) {
      normalized[key] = Object.fromEntries(
        Object.entries(child).map(([name, nested]) => [name, normalizeSchemaNode(nested, seen)])
      );
    } else if (schemaArrayKeywords.has(key) && Array.isArray(child)) {
      normalized[key] = child.map(nested => normalizeSchemaNode(nested, seen));
    } else if (schemaValueKeywords.has(key)) {
      normalized[key] = Array.isArray(child)
        ? child.map(nested => normalizeSchemaNode(nested, seen))
        : normalizeSchemaNode(child, seen);
    } else {
      normalized[key] = child;
    }
  }

  // Composio tool inputs treat an omitted `additionalProperties` as strict, but
  // only for objects that actually name properties. Injecting `false` into a
  // property-less object (`{ type: "object" }`, `properties: {}`) or a
  // pattern-only object turned every valid free-form payload into an unknown-key
  // rejection.
  if (
    isObjectSchema(normalized) &&
    normalized.additionalProperties === undefined &&
    hasNamedProperties(normalized)
  ) {
    normalized.additionalProperties = false;
  }

  normalizeBounds(normalized);
  normalizeFormats(normalized);
  const withNullable = normalizeNullable(normalized);
  seen.set(value, withNullable as InterpreterSchema);
  return withNullable as InterpreterSchema;
};

const normalizeJsonSchema = (schema: JsonObject): InterpreterSchema =>
  normalizeSchemaNode(schema, new WeakMap()) as InterpreterSchema;

// Walks the same child positions `normalizeSchemaNode` does, so a node is
// visited exactly where the interpreter would descend into it.
const forEachSchemaNode = (
  value: unknown,
  seen: WeakSet<object>,
  visit: (node: JsonObject) => void
): void => {
  if (!isJsonObject(value) || seen.has(value)) {
    return;
  }
  seen.add(value);
  visit(value);

  for (const [key, child] of Object.entries(value)) {
    if (schemaMapKeywords.has(key) && isJsonObject(child)) {
      for (const nested of Object.values(child)) {
        forEachSchemaNode(nested, seen, visit);
      }
    } else if (schemaArrayKeywords.has(key) && Array.isArray(child)) {
      for (const nested of child) {
        forEachSchemaNode(nested, seen, visit);
      }
    } else if (schemaValueKeywords.has(key)) {
      for (const nested of Array.isArray(child) ? child : [child]) {
        forEachSchemaNode(nested, seen, visit);
      }
    }
  }
};

const assertRegexCompiles = (pattern: string, keyword: string): void => {
  try {
    // The same flag `@cfworker/json-schema` compiles with, so this accepts
    // exactly the patterns the interpreter would.
    new RegExp(pattern, 'u');
  } catch (cause) {
    throw new Error(`Invalid ${keyword} regular expression ${JSON.stringify(pattern)}.`, { cause });
  }
};

// Follows every reference reachable from one dynamic-key subschema, including
// through the schemas those references resolve to, so a local pointer whose
// target carries a dangling reference is caught as well.
const assertDynamicReferencesResolve = (
  subSchema: unknown,
  lookup: Record<string, unknown>,
  seen: WeakSet<object>
): void => {
  forEachSchemaNode(subSchema, seen, node => {
    const ref = node.$ref;
    if (typeof ref !== 'string') {
      return;
    }

    const absolute = (node as { readonly __absolute_ref__?: string }).__absolute_ref__ ?? ref;
    const target = lookup[absolute];
    if (target === undefined) {
      throw new Error(`Unresolved $ref ${JSON.stringify(ref)} in a dynamic-key schema.`);
    }

    assertDynamicReferencesResolve(target, lookup, seen);
  });
};

// `@cfworker/json-schema` compiles `patternProperties` keys and resolves `$ref`
// lazily, inside `validate`. Left alone, a defect in the schema surfaces once
// per call through the same channel as a genuine input failure, telling the
// caller their arguments are wrong when the tool's schema is what is broken.
// Checking eagerly moves those defects to construction, where the CLI already
// reports them as a compile failure against the cached schema path.
//
// The scope matches what the Python SDK rejects while wrapping a tool: the keys
// of `patternProperties`, and references inside a dynamic-key subschema. A
// reference in a declared property is deliberately left to the interpreter —
// widening past parity would reject tool schemas that validate today.
const assertSchemaIsInterpretable = (schema: InterpreterSchema): void => {
  // Re-derives the lookup the `Validator` keeps private. `dereference` builds a
  // fresh map per call and reuses the `__absolute_ref__` it already stamped, so
  // running it a second time is consistent with the interpreter's own view.
  const lookup = dereference(schema);

  forEachSchemaNode(schema, new WeakSet(), node => {
    const patternProperties = node.patternProperties;
    if (isJsonObject(patternProperties)) {
      for (const [pattern, patternSchema] of Object.entries(patternProperties)) {
        assertRegexCompiles(pattern, 'patternProperties');
        assertDynamicReferencesResolve(patternSchema, lookup, new WeakSet());
      }
    }

    if (isJsonObject(node.additionalProperties)) {
      assertDynamicReferencesResolve(node.additionalProperties, lookup, new WeakSet());
    }
  });
};

const decodePointer = (pointer: string): ReadonlyArray<string> => {
  if (pointer === '#' || pointer === '') {
    return [];
  }

  const fragment = pointer.startsWith('#') ? pointer.slice(1) : pointer;
  return fragment
    .split('/')
    .slice(1)
    .map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
};

const encodePointerPart = (part: string): string => part.replace(/~/g, '~0').replace(/\//g, '~1');

const instancePath = (pointer: string): ReadonlyArray<PropertyKey> =>
  decodePointer(pointer).map(part => (/^(?:0|[1-9]\d*)$/.test(part) ? Number(part) : part));

const valueAtPointer = (root: unknown, pointer: string): unknown =>
  decodePointer(pointer).reduce<unknown>((current, part) => {
    if (isJsonObject(current)) {
      return current[part];
    }
    if (Array.isArray(current) && /^(?:0|[1-9]\d*)$/.test(part)) {
      return current[Number(part)];
    }
    return undefined;
  }, root);

const parentSchemaAtKeyword = (
  schema: InterpreterSchema,
  keywordLocation: string
): JsonObject | null => {
  const parts = decodePointer(keywordLocation);
  const parentPointer = `#/${parts.slice(0, -1).map(encodePointerPart).join('/')}`;
  const parent = valueAtPointer(schema, parts.length === 1 ? '#' : parentPointer);
  return isJsonObject(parent) ? parent : null;
};

const propertyNameFromError = (error: OutputUnit): string | undefined =>
  error.error.match(/^Property "([^"]+)"/)?.[1];

const requiredNameFromError = (error: OutputUnit): string | undefined =>
  error.error.match(/required property "([^"]+)"/)?.[1];

const matchesPattern = (pattern: string, key: string): boolean => {
  try {
    return new RegExp(pattern, 'u').test(key);
  } catch {
    return false;
  }
};

const propertyIsDeclared = (parent: JsonObject | null, key: string): boolean => {
  if (!parent) {
    return false;
  }
  if (isJsonObject(parent.properties) && key in parent.properties) {
    return true;
  }
  if (!isJsonObject(parent.patternProperties)) {
    return false;
  }

  return Object.keys(parent.patternProperties).some(pattern => matchesPattern(pattern, key));
};

const hasSpecificChildError = (errors: ReadonlyArray<OutputUnit>, error: OutputUnit): boolean =>
  errors.some(
    candidate =>
      candidate !== error &&
      candidate.instanceLocation.startsWith(`${error.instanceLocation}/`) &&
      candidate.keyword !== 'additionalProperties'
  );

const mapValidationErrors = (
  errors: ReadonlyArray<OutputUnit>,
  schema: InterpreterSchema
): ReadonlyArray<JsonSchemaValidationIssue> => {
  const ignored = new Set<OutputUnit>();
  const unknownByLocation = new Map<string, Array<string>>();

  for (const [index, error] of errors.entries()) {
    if (error.keyword !== 'additionalProperties') {
      continue;
    }
    const key = propertyNameFromError(error);
    if (!key) {
      continue;
    }
    const parent = parentSchemaAtKeyword(schema, error.keywordLocation);
    const additionalProperties = valueAtPointer(schema, error.keywordLocation);
    if (additionalProperties === false) {
      const child = errors[index + 1];
      const childLocation = `${error.instanceLocation}/${encodePointerPart(key)}`;
      if (child?.keyword === 'false' && child.instanceLocation === childLocation) {
        ignored.add(child);
      }
    }
    if (propertyIsDeclared(parent, key)) {
      ignored.add(error);
      continue;
    }

    if (additionalProperties === false) {
      const keys = unknownByLocation.get(error.instanceLocation) ?? [];
      keys.push(key);
      unknownByLocation.set(error.instanceLocation, keys);
      ignored.add(error);
    } else if (hasSpecificChildError(errors, error)) {
      ignored.add(error);
    }
  }

  const issues: Array<JsonSchemaValidationIssue> = [];
  for (const [location, keys] of unknownByLocation) {
    issues.push({
      code: 'unrecognized_keys',
      keys,
      message: `Unknown key${keys.length === 1 ? '' : 's'}: ${keys.join(', ')}`,
      path: instancePath(location),
    });
  }

  for (const error of errors) {
    if (ignored.has(error)) {
      continue;
    }
    if (
      (error.keyword === 'properties' ||
        error.keyword === 'patternProperties' ||
        error.keyword === '$ref') &&
      hasSpecificChildError(errors, error)
    ) {
      continue;
    }

    const path = [...instancePath(error.instanceLocation)];
    const requiredName = error.keyword === 'required' ? requiredNameFromError(error) : undefined;
    if (requiredName) {
      path.push(requiredName);
    }
    issues.push({ code: error.keyword, message: error.error, path });
  }

  return issues;
};

const defaultFormatIssues = (
  issues: ReadonlyArray<JsonSchemaValidationIssue>
): ReadonlyArray<string> =>
  issues.map(issue => {
    const location = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${location}: ${issue.message}`;
  });

// Validation is expressed as a filter over `Schema.Unknown` rather than a
// `Schema.declare` codec: the interpreter already owns the whole decision, so
// there is nothing to decode, and a filter reports every failure through the
// `{ path, message }` shape Effect normalizes for us. `Schema.filter` is also
// the API that survives the Effect 4 rewrite — where `ParseResult` is split
// into `SchemaIssue`/`SchemaParser` and declarations lose their encode half —
// as a rename to `Schema.check(Schema.makeFilter(...))`.
export const jsonSchemaToEffectSchema = (
  jsonSchema: JsonObject,
  options: JsonSchemaToEffectSchemaOptions = {}
): Schema.Schema<unknown> => {
  const normalizedSchema = normalizeJsonSchema(jsonSchema);
  const validator = new Validator(normalizedSchema, options.draft ?? '7', false);
  assertSchemaIsInterpretable(normalizedSchema);
  const formatIssues = options.formatIssues ?? defaultFormatIssues;

  return Schema.Unknown.pipe(
    Schema.filter(input => {
      let validation: ReturnType<Validator['validate']>;
      try {
        validation = validator.validate(input);
      } catch (error) {
        // Schema defects are rejected at construction, so what reaches here is
        // input the interpreter cannot represent at all — a `bigint`, `symbol`,
        // `function`, or `undefined`. That is a property of the input, so it
        // belongs in the filter. A string is `Schema.filter`'s shorthand for the
        // `ParseResult.Type` issue Effect would otherwise build by hand.
        return `JSON Schema validation failed: ${error}`;
      }
      if (validation.valid) {
        return true;
      }

      const issues = mapValidationErrors(validation.errors, normalizedSchema);
      const messages = formatIssues(issues);
      if (messages.length === 0) {
        return 'Input does not match the JSON schema.';
      }

      // `formatIssues` may fan one issue out into several messages, so the
      // location stays inside the message (as it always has) instead of being
      // reported as a structural path.
      return messages.map(message => ({ path: [], message }));
    })
  );
};
