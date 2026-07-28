import { Validator } from '@cfworker/json-schema';
import type { OutputUnit, Schema as InterpreterSchema, SchemaDraft } from '@cfworker/json-schema';
import { Either, ParseResult, Schema } from 'effect';

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

  if (isObjectSchema(normalized) && normalized.additionalProperties === undefined) {
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

  return Object.keys(parent.patternProperties).some(pattern =>
    Either.getOrElse(
      Either.try(() => new RegExp(pattern, 'u').test(key)),
      () => false
    )
  );
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

export const jsonSchemaToEffectSchema = (
  jsonSchema: JsonObject,
  options: JsonSchemaToEffectSchemaOptions = {}
) => {
  const normalizedSchema = normalizeJsonSchema(jsonSchema);
  const validator = new Validator(normalizedSchema, options.draft ?? '7', false);
  const formatIssues = options.formatIssues ?? defaultFormatIssues;

  return Schema.declare([Schema.Unknown], {
    decode: () => (input, _parseOptions, ast) => {
      const validation = Either.try(() => validator.validate(input));
      if (Either.isLeft(validation)) {
        return ParseResult.fail(
          new ParseResult.Type(ast, input, `JSON Schema validation failed: ${validation.left}`)
        );
      }
      if (validation.right.valid) {
        return ParseResult.succeed(input);
      }

      const issues = mapValidationErrors(validation.right.errors, normalizedSchema);
      const messages = formatIssues(issues);
      const [first, ...rest] = messages.map(message => new ParseResult.Type(ast, input, message));
      return ParseResult.fail(
        first
          ? new ParseResult.Composite(ast, input, [first, ...rest])
          : new ParseResult.Type(ast, input, 'Input does not match the JSON schema.')
      );
    },
    encode: () => input => ParseResult.succeed(input),
  });
};
