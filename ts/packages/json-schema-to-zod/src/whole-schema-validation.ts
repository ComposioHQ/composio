import { encodePointer, format, Validator } from '@cfworker/json-schema';
import type { Schema as InterpreterSchema } from '@cfworker/json-schema';
import { z } from 'zod/v3';

import type { JsonSchema, JsonSchemaObject } from './types';
import { toUnicodePattern } from './utils/unicode-pattern';

const REQUIRES_WHOLE_SCHEMA_VALIDATION = new Set([
  '$ref',
  'additionalItems',
  'allOf',
  'anyOf',
  'contains',
  'dependencies',
  'else',
  'if',
  'maxProperties',
  'minProperties',
  'not',
  'oneOf',
  'propertyNames',
  'then',
  'uniqueItems',
]);

const TYPELESS_TYPE_SCOPED_KEYWORDS = new Set([
  'properties',
  'patternProperties',
  'additionalProperties',
  'propertyNames',
  'required',
  'dependencies',
  'minProperties',
  'maxProperties',
  'items',
  'additionalItems',
  'contains',
  'minItems',
  'maxItems',
  'uniqueItems',
]);

const SCHEMA_MAP_KEYWORDS = new Set([
  '$defs',
  'definitions',
  'dependencies',
  'patternProperties',
  'properties',
]);

const SCHEMA_ARRAY_KEYWORDS = new Set(['allOf', 'anyOf', 'oneOf']);

const SCHEMA_VALUE_KEYWORDS = new Set([
  'additionalItems',
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasRequiredDefault = (schema: JsonSchemaObject): boolean => {
  if (!Array.isArray(schema.required) || !isObject(schema.properties)) {
    return false;
  }

  return schema.required.some(name => {
    const property = schema.properties?.[name];
    return isObject(property) && property.default !== undefined;
  });
};

const hasUnparsedRequiredProperty = (schema: JsonSchemaObject): boolean => {
  if (!Array.isArray(schema.required)) {
    return false;
  }
  const declared = new Set(Object.keys(schema.properties ?? {}));
  return schema.required.some(name => !declared.has(name));
};

/**
 * The native parsers preserve useful Zod structure and materialize defaults,
 * but some JSON Schema assertions cannot be represented by their first-match
 * dispatch. Only those schemas receive an authoritative Draft 7 guard.
 */
export const requiresWholeSchemaValidation = (
  schema: JsonSchema,
  seen: WeakSet<object> = new WeakSet()
): boolean => {
  if (!isObject(schema) || seen.has(schema)) {
    return false;
  }
  seen.add(schema);

  if (
    Object.keys(schema).some(key => REQUIRES_WHOLE_SCHEMA_VALIDATION.has(key)) ||
    (schema.type === undefined &&
      Object.keys(schema).some(key => TYPELESS_TYPE_SCOPED_KEYWORDS.has(key))) ||
    hasUnparsedRequiredProperty(schema) ||
    hasRequiredDefault(schema)
  ) {
    return true;
  }

  for (const [key, child] of Object.entries(schema)) {
    if (SCHEMA_MAP_KEYWORDS.has(key) && isObject(child)) {
      if (
        Object.values(child).some(value => requiresWholeSchemaValidation(value as JsonSchema, seen))
      ) {
        return true;
      }
    } else if (SCHEMA_ARRAY_KEYWORDS.has(key) && Array.isArray(child)) {
      if (child.some(value => requiresWholeSchemaValidation(value as JsonSchema, seen))) {
        return true;
      }
    } else if (SCHEMA_VALUE_KEYWORDS.has(key)) {
      const values = Array.isArray(child) ? child : [child];
      if (values.some(value => requiresWholeSchemaValidation(value as JsonSchema, seen))) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Some schemas are valid for JSON instance types that the native parser does
 * not materialize. Such a node is parsed as `z.any()` so the Draft 7 guard
 * that every one of these keywords also activates (see
 * `requiresWholeSchemaValidation`) stays the acceptance authority without
 * piping into a narrower Zod schema. The check is deliberately local: a
 * permissive descendant must not widen its enclosing parser, or sibling
 * defaults would stop materializing.
 */
export const requiresPermissiveMaterialization = (schema: JsonSchema): boolean =>
  isObject(schema) &&
  ('$ref' in schema ||
    (schema.type === undefined &&
      (Object.keys(schema).some(key => TYPELESS_TYPE_SCOPED_KEYWORDS.has(key)) ||
        ['if', 'then', 'else', 'not'].some(key => key in schema))));

/**
 * The guard schema for a node nested at `path` inside `root`: the enclosing
 * document pointed at that node, so local `$ref`s resolve exactly as they do
 * for the document root. Draft 7 ignores the keywords next to `$ref`, which
 * is what lets the root's own assertions be reused as the pointer carrier.
 */
export const guardSchemaAt = (
  node: JsonSchema,
  refs: { root?: JsonSchema; path: ReadonlyArray<string | number> }
): JsonSchema =>
  isObject(refs.root) && refs.path.length > 0
    ? // `encodePointer` is the interpreter's own key encoding, so the pointer
      // lands on exactly the lookup entry `dereference` registered.
      { ...refs.root, $ref: `#/${refs.path.map(part => encodePointer(String(part))).join('/')}` }
    : node;

const patternKeyRenames = new WeakMap<object, ReadonlyMap<string, string>>();

/**
 * The Unicode spelling of each `patternProperties` key. Two keys that spell
 * the same way (`^a\_b$` and `^a_b$`) stay separate entries: the later one is
 * wrapped in a non-capturing group, which matches the same names, so neither
 * value schema is dropped. A key with no Unicode spelling is kept as is and
 * surfaces as a guard failure rather than an unenforced constraint.
 */
const renamePatternKeys = (patternProperties: object): ReadonlyMap<string, string> => {
  const cached = patternKeyRenames.get(patternProperties);
  if (cached) {
    return cached;
  }

  const renames = new Map<string, string>();
  const used = new Set<string>();
  for (const key of Object.keys(patternProperties)) {
    let renamed = toUnicodePattern(key) ?? key;
    while (used.has(renamed)) {
      renamed = `(?:${renamed})`;
    }
    used.add(renamed);
    renames.set(key, renamed);
  }
  patternKeyRenames.set(patternProperties, renames);
  return renames;
};

const decodePointerSegment = (segment: string): string => {
  try {
    return decodeURI(segment).replace(/~1/g, '/').replace(/~0/g, '~');
  } catch {
    return segment;
  }
};

/**
 * What a JSON Pointer segment addresses: a keyword of a schema, a name in a
 * keyword's map (`properties`, `$defs`, ...), a `patternProperties` key, an
 * index into a schema array, or something that holds no schemas.
 */
type PointerPosition = 'keyword' | 'name' | 'patternKey' | 'index' | 'other';

const positionAfter = (position: PointerPosition, key: string, child: unknown): PointerPosition => {
  if (position !== 'keyword') {
    return position === 'other' ? 'other' : 'keyword';
  }
  if (key === 'patternProperties') {
    return 'patternKey';
  }
  if (SCHEMA_MAP_KEYWORDS.has(key)) {
    return 'name';
  }
  if (SCHEMA_ARRAY_KEYWORDS.has(key) || (SCHEMA_VALUE_KEYWORDS.has(key) && Array.isArray(child))) {
    return 'index';
  }
  return SCHEMA_VALUE_KEYWORDS.has(key) ? 'keyword' : 'other';
};

/**
 * A local `$ref` rewritten to address the renamed `patternProperties` keys of
 * the interpreter copy. `root` is the unrenamed document it points into. Only
 * a segment in keyword position is a keyword, so a definition that happens to
 * be named `patternProperties` is not mistaken for one.
 */
const renameRefThroughPatternKeys = (ref: string, root: unknown): string => {
  if (!ref.startsWith('#/')) {
    return ref;
  }

  let node: unknown = root;
  let position: PointerPosition = 'keyword';
  let changed = false;
  const renamed = ref
    .slice(2)
    .split('/')
    .map(segment => {
      const key = decodePointerSegment(segment);
      let result = segment;
      if (position === 'patternKey' && isObject(node)) {
        const renamedKey = renamePatternKeys(node).get(key);
        if (renamedKey !== undefined && renamedKey !== key) {
          result = encodePointer(renamedKey);
          changed = true;
        }
      }
      const child =
        isObject(node) || Array.isArray(node) ? (node as Record<string, unknown>)[key] : undefined;
      position = positionAfter(position, key, child);
      node = child;
      return result;
    });

  return changed ? `#/${renamed.join('/')}` : ref;
};

const PATTERN_FORMAT_PREFIX = 'composio-pattern:';

/**
 * Registers `pattern` as an interpreter format that tests it exactly as the
 * native string parser does, without the `u` flag, and returns the format
 * name. The name is derived from the pattern, so every schema using the same
 * pattern shares one entry. Returns `undefined` for a pattern that does not
 * compile at all, which the interpreter then reports as it always has.
 */
const patternFormat = (pattern: string): string | undefined => {
  const name = `${PATTERN_FORMAT_PREFIX}${pattern}`;
  if (!Object.hasOwn(format, name)) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      return undefined;
    }
    format[name] = value => regex.test(value);
  }
  return name;
};

/**
 * Rewrites the guard's private copy of a schema into what the Draft 7
 * interpreter understands the way the native parsers do:
 *
 * - OpenAPI 3.0 / Draft 4 spell exclusive bounds as a boolean flag next to
 *   `minimum`/`maximum`. The interpreter ignores the flag, so it receives the
 *   numeric spelling the native number parser already honors.
 * - The interpreter compiles patterns with the `u` flag, which refuses legacy
 *   syntax tool schemas use, such as `\_`. A `pattern` becomes a format that
 *   tests it without the flag, exactly like the native string parser. A
 *   `patternProperties` key cannot leave the interpreter, so it gets its
 *   Unicode spelling (`toUnicodePattern`), and local `$ref`s through a renamed
 *   key follow the rename. `root` is the unmodified document those refs
 *   address.
 */
const prepareInterpreterSchema = (value: unknown, seen: WeakSet<object>, root: unknown): void => {
  if (!isObject(value) || seen.has(value)) {
    return;
  }
  seen.add(value);

  if (value.exclusiveMinimum === true && typeof value.minimum === 'number') {
    value.exclusiveMinimum = value.minimum;
    delete value.minimum;
  } else if (typeof value.exclusiveMinimum === 'boolean') {
    delete value.exclusiveMinimum;
  }
  if (value.exclusiveMaximum === true && typeof value.maximum === 'number') {
    value.exclusiveMaximum = value.maximum;
    delete value.maximum;
  } else if (typeof value.exclusiveMaximum === 'boolean') {
    delete value.exclusiveMaximum;
  }

  if (typeof value.$ref === 'string') {
    value.$ref = renameRefThroughPatternKeys(value.$ref, root);
  }
  const patternFormatName =
    typeof value.pattern === 'string' ? patternFormat(value.pattern) : undefined;
  if (patternFormatName !== undefined) {
    delete value.pattern;
    if (value.format === undefined) {
      value.format = patternFormatName;
    } else {
      const allOf = Array.isArray(value.allOf) ? value.allOf : [];
      value.allOf = [...allOf, { format: patternFormatName }];
    }
  }
  if (isObject(value.patternProperties)) {
    const renames = renamePatternKeys(value.patternProperties);
    value.patternProperties = Object.fromEntries(
      Object.entries(value.patternProperties).map(([pattern, schema]) => [
        renames.get(pattern) ?? pattern,
        schema,
      ])
    );
  }

  for (const [key, child] of Object.entries(value)) {
    if (SCHEMA_MAP_KEYWORDS.has(key) && isObject(child)) {
      Object.values(child).forEach(nested => prepareInterpreterSchema(nested, seen, root));
    } else if (SCHEMA_ARRAY_KEYWORDS.has(key) && Array.isArray(child)) {
      child.forEach(nested => prepareInterpreterSchema(nested, seen, root));
    } else if (SCHEMA_VALUE_KEYWORDS.has(key)) {
      (Array.isArray(child) ? child : [child]).forEach(nested =>
        prepareInterpreterSchema(nested, seen, root)
      );
    }
  }
};

type WholeSchemaGuard = (value: unknown) => string | undefined;
type GuardedDef = z.ZodTypeDef & { wholeSchemaGuard?: WholeSchemaGuard };
type ZodSchemaClass = {
  new (def: z.ZodTypeDef): z.ZodTypeAny;
  prototype: z.ZodTypeAny;
};

const guardedSchemaClasses = new WeakMap<ZodSchemaClass, ZodSchemaClass>();

/**
 * A subclass of the parsed schema's own class that checks the source value
 * against the guard before parsing it. Keeping the class, rather than wrapping
 * it in a pipeline, keeps the schema's kind: a guarded object is still a
 * `ZodObject` with a `shape`, which is what zod-to-json-schema and the MCP SDK
 * need to emit a root `type: "object"` for LLM tool parameters. The guard lives
 * on `_def`, so copies such as `.describe()` keep it.
 */
const guardedSchemaClass = (Base: ZodSchemaClass): ZodSchemaClass => {
  const cached = guardedSchemaClasses.get(Base);
  if (cached) {
    return cached;
  }

  const parseAsBase = Base.prototype._parse;
  class Guarded extends Base {
    override _parse(input: z.ParseInput): z.ParseReturnType<unknown> {
      const failure = (this._def as GuardedDef).wholeSchemaGuard?.(input.data);
      if (failure === undefined) {
        return parseAsBase.call(this, input);
      }
      z.addIssueToContext(this._getOrReturnCtx(input), {
        code: z.ZodIssueCode.custom,
        message: failure,
      });
      return z.DIRTY(input.data);
    }
  }
  guardedSchemaClasses.set(Base, Guarded);
  // Guarding an already guarded schema reuses its class and composes guards.
  guardedSchemaClasses.set(Guarded, Guarded);
  return Guarded;
};

export const withWholeSchemaValidation = (
  jsonSchema: JsonSchema,
  parsedSchema: z.ZodTypeAny
): z.ZodTypeAny => {
  const interpreterSchema = structuredClone(jsonSchema);
  prepareInterpreterSchema(interpreterSchema, new WeakSet(), jsonSchema);
  const validator = new Validator(interpreterSchema as InterpreterSchema, '7', false);

  // Validate the source value before defaults and other Zod transforms run.
  // Otherwise a missing required field can be synthesized and incorrectly
  // appear valid to the JSON Schema interpreter.
  const innerGuard = (parsedSchema._def as GuardedDef).wholeSchemaGuard;
  const wholeSchemaGuard: WholeSchemaGuard = value => {
    let result: ReturnType<Validator['validate']>;
    try {
      result = validator.validate(value);
    } catch (cause) {
      return `JSON Schema validation failed: ${String(cause)}`;
    }

    if (!result.valid) {
      return result.errors[0]?.error ?? 'Input does not satisfy the complete JSON Schema.';
    }
    return innerGuard?.(value);
  };

  const Guarded = guardedSchemaClass(parsedSchema.constructor as ZodSchemaClass);
  return new Guarded({ ...parsedSchema._def, wholeSchemaGuard } as GuardedDef);
};
