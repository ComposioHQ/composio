import {
  encodePointer,
  format,
  ignoredKeyword,
  schemaArrayKeyword,
  schemaMapKeyword,
  Validator,
} from '@cfworker/json-schema';
import type { Schema as InterpreterSchema } from '@cfworker/json-schema';
import { z } from 'zod/v3';

import type { JsonSchema, JsonSchemaObject } from './types';
import { InvalidPatternError } from './utils/compile-pattern';
import { createPatternMatcher, patternMatches, type PatternMatcher } from './utils/linear-pattern';
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

type SchemaNode = { value: Record<string, unknown>; path: ReadonlyArray<string | number> };

/**
 * Every object the interpreter registers as a schema, found with its own walk
 * (`dereference`): each key it does not ignore, extension locations included.
 * A `$ref` resolves only through that registry, whether it is a JSON Pointer,
 * an `$id` or an `$anchor`, so these are all the schemas the interpreter can
 * ever validate against.
 */
function* interpreterSchemaNodes(
  value: unknown,
  path: ReadonlyArray<string | number> = [],
  seen: WeakSet<object> = new WeakSet()
): Generator<SchemaNode> {
  if (!isObject(value) || seen.has(value)) {
    return;
  }
  seen.add(value);
  yield { value, path };

  for (const [key, child] of Object.entries(value)) {
    // Indexed like `dereference` does, so inherited names are skipped alike.
    if ((ignoredKeyword as Record<string, boolean>)[key]) {
      continue;
    }
    if (Array.isArray(child)) {
      if ((schemaArrayKeyword as Record<string, boolean>)[key]) {
        for (const [index, nested] of child.entries()) {
          yield* interpreterSchemaNodes(nested, [...path, key, index], seen);
        }
      }
    } else if ((schemaMapKeyword as Record<string, boolean>)[key]) {
      if (isObject(child)) {
        for (const [name, nested] of Object.entries(child)) {
          yield* interpreterSchemaNodes(nested, [...path, key, name], seen);
        }
      }
    } else {
      yield* interpreterSchemaNodes(child, [...path, key], seen);
    }
  }
}

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

/** The interpreter spelling of one `patternProperties` key. */
type PatternKeySpelling = (pattern: string) => string;
/** The interpreter spelling of every key of one `patternProperties` object. */
type PatternKeyRenamer = (patternProperties: object) => ReadonlyMap<string, string>;

/**
 * Spells each key of a `patternProperties` object with `spell`. Two keys that
 * spell the same way (`^a\_b$` and `^a_b$`) stay separate entries: the later
 * one is wrapped in a non-capturing group, which matches the same names, so
 * neither value schema is dropped. `renamed` collects every spelling that
 * differs from its key.
 */
const patternKeyRenamer = (
  spell: PatternKeySpelling,
  renamed: Map<string, string> = new Map()
): PatternKeyRenamer => {
  const cache = new WeakMap<object, ReadonlyMap<string, string>>();
  return patternProperties => {
    const cached = cache.get(patternProperties);
    if (cached) {
      return cached;
    }

    const renames = new Map<string, string>();
    const used = new Set<string>();
    for (const key of Object.keys(patternProperties)) {
      let spelling = spell(key);
      while (used.has(spelling)) {
        spelling = `(?:${spelling})`;
      }
      used.add(spelling);
      renames.set(key, spelling);
      if (spelling !== key) {
        renamed.set(spelling, key);
      }
    }
    cache.set(patternProperties, renames);
    return renames;
  };
};

/**
 * The interpreter matches `patternProperties` keys itself, with a native
 * backtracking `RegExp`, against object keys that come from the caller. So a
 * key never reaches it as written. Instead, each validation spells it as the
 * literal set of instance keys it matches under RE2 (an anchored trie, which
 * cannot backtrack beyond the key length). Interpreter matching then agrees
 * with RE2 on every key it can see.
 *
 * Returns the RE2 matcher of each key, or `undefined` for a key that does not
 * compile in the Unicode grammar: the interpreter throws on it when reached,
 * which fails the guard closed, as it always has. A key that compiles but
 * needs a backtracking engine is rejected at conversion, as the native object
 * parser does.
 */
const collectPatternKeyMatchers = (
  nodes: readonly SchemaNode[]
): Map<string, PatternMatcher | undefined> => {
  const matchers = new Map<string, PatternMatcher | undefined>();
  for (const { value, path } of nodes) {
    if (!isObject(value.patternProperties)) {
      continue;
    }
    for (const key of Object.keys(value.patternProperties)) {
      if (matchers.has(key)) {
        continue;
      }
      let matcher: PatternMatcher | undefined;
      try {
        matcher = createPatternMatcher(key);
      } catch {
        matcher = undefined;
      }
      if (matcher !== undefined && matcher.kind !== 'linear') {
        if (unicodeSpellingCompiles(key)) {
          throw new InvalidPatternError(
            'patternProperties',
            key,
            [...path, 'patternProperties', key],
            'unsupported',
            'patternProperties keys must not use lookaround or backreferences'
          );
        }
        matcher = undefined;
      }
      matchers.set(key, matcher);
    }
  }

  return matchers;
};

/** The Unicode spelling of a key that cannot be matched with RE2. */
const fallbackKeySpelling = (pattern: string): string => toUnicodePattern(pattern) ?? pattern;

const unicodeSpellingCompiles = (pattern: string): boolean => {
  try {
    new RegExp(fallbackKeySpelling(pattern), 'u');
    return true;
  } catch {
    return false;
  }
};

/** Every object key anywhere in `value`. */
const collectInstanceKeys = (
  value: unknown,
  keys: Set<string> = new Set(),
  seen: WeakSet<object> = new WeakSet()
): Set<string> => {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return keys;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(item => collectInstanceKeys(item, keys, seen));
  } else {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectInstanceKeys(child, keys, seen);
    }
  }
  return keys;
};

const UNICODE_SYNTAX_CHARACTER = /[$()*+./?[\\\]^{|}]/g;

type KeyTrie = { end: boolean; children: Map<string, KeyTrie> };

/** Spells a trie node as a Unicode-grammar pattern over its code points. */
const spellKeyTrie = (node: KeyTrie): string => {
  const branches = [...node.children].map(([char, child]) => {
    let spelling = char.replace(UNICODE_SYNTAX_CHARACTER, '\\$&');
    let next = child;
    // Collapse single-path runs so nesting grows only at branch points.
    while (!next.end && next.children.size === 1) {
      const [[nextChar, grandchild]] = next.children;
      spelling += nextChar.replace(UNICODE_SYNTAX_CHARACTER, '\\$&');
      next = grandchild;
    }
    return spelling + spellKeyTrie(next);
  });
  if (branches.length === 0) {
    return '';
  }
  if (branches.length === 1 && !node.end) {
    return branches[0];
  }
  return `(?:${branches.join('|')}${node.end ? '|' : ''})`;
};

/**
 * An anchored Unicode-grammar pattern that matches exactly `keys`. Branches of
 * a trie start with distinct characters, so matching never backtracks further
 * than the key being tested. No keys gives `[]`, which matches nothing.
 */
const literalKeysPattern = (keys: readonly string[]): string => {
  if (keys.length === 0) {
    return '[]';
  }
  const root: KeyTrie = { end: false, children: new Map() };
  for (const key of keys) {
    let node = root;
    for (const char of key) {
      let child = node.children.get(char);
      if (!child) {
        child = { end: false, children: new Map() };
        node.children.set(char, child);
      }
      node = child;
    }
    node.end = true;
  }
  return `^${spellKeyTrie(root)}$`;
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
const renameRefThroughPatternKeys = (
  ref: string,
  root: unknown,
  renamePatternKeys: PatternKeyRenamer,
  schemaObjects: WeakSet<object>
): string => {
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
      if (position === 'other' && isObject(node) && schemaObjects.has(node)) {
        position = 'keyword';
      }
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

/** Pattern formats of one guard, installed on the interpreter only while it validates. */
type PatternFormats = Map<string, (value: string) => boolean>;

/**
 * Adds `pattern` to `formats` as an interpreter format that tests it as the
 * native string parser does (legacy grammar, RE2 with a bounded fallback; see
 * `compilePattern`), and returns the format name. Returns `undefined` for a
 * pattern that does not compile at all, which the interpreter then reports as
 * it always has. `matchers` caches compiled patterns across validations.
 */
const patternFormat = (
  pattern: string,
  formats: PatternFormats,
  matchers: Map<string, PatternMatcher>
): string | undefined => {
  const name = `${PATTERN_FORMAT_PREFIX}${pattern}`;
  if (!formats.has(name)) {
    let matcher = matchers.get(pattern);
    if (matcher === undefined) {
      try {
        new RegExp(pattern);
      } catch {
        return undefined;
      }
      matcher = createPatternMatcher(pattern);
      matchers.set(pattern, matcher);
    }
    const compiled = matcher;
    formats.set(name, value => patternMatches(compiled, value));
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
 * - The interpreter compiles patterns natively with the `u` flag, which
 *   refuses legacy syntax tool schemas use, such as `\_`, and backtracks. A
 *   `pattern` becomes a format that tests it exactly like the native string
 *   parser. A `patternProperties` key cannot leave the interpreter, so it is
 *   respelled by `renamePatternKeys`, and local `$ref`s through a renamed key
 *   follow the rename. `root` is the unmodified document those refs address.
 *   `formats` collects the pattern formats.
 */
const prepareInterpreterSchema = (
  value: Record<string, unknown>,
  root: unknown,
  formats: PatternFormats,
  patternMatchers: Map<string, PatternMatcher>,
  renamePatternKeys: PatternKeyRenamer,
  schemaObjects: WeakSet<object>
): void => {
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
    value.$ref = renameRefThroughPatternKeys(value.$ref, root, renamePatternKeys, schemaObjects);
  }
  const patternFormatName =
    typeof value.pattern === 'string'
      ? patternFormat(value.pattern, formats, patternMatchers)
      : undefined;
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

type PreparedInterpreter = {
  validator: Validator;
  formats: PatternFormats;
  /** Interpreter spelling of each respelled `patternProperties` key, to its key. */
  renamed: ReadonlyMap<string, string>;
};

export const withWholeSchemaValidation = (
  jsonSchema: JsonSchema,
  parsedSchema: z.ZodTypeAny
): z.ZodTypeAny => {
  const patternMatchers = new Map<string, PatternMatcher>();
  const originalNodes = [...interpreterSchemaNodes(jsonSchema)];
  const schemaObjects = new WeakSet(originalNodes.map(node => node.value));
  const keyMatchers = collectPatternKeyMatchers(originalNodes);

  const prepare = (spell: PatternKeySpelling): PreparedInterpreter => {
    const interpreterSchema = structuredClone(jsonSchema);
    const formats: PatternFormats = new Map();
    const renamed = new Map<string, string>();
    const renamePatternKeys = patternKeyRenamer(spell, renamed);
    // Capture targets before key renaming changes the paths that address them.
    const nodes = [...interpreterSchemaNodes(interpreterSchema)];
    for (const { value } of nodes) {
      prepareInterpreterSchema(
        value,
        jsonSchema,
        formats,
        patternMatchers,
        renamePatternKeys,
        schemaObjects
      );
    }
    return {
      validator: new Validator(interpreterSchema as InterpreterSchema, '7', false),
      formats,
      renamed,
    };
  };

  // Without `patternProperties` the interpreter schema never changes. With
  // them, it is rebuilt for each value, spelling every key as the instance
  // keys it matches.
  const shared = keyMatchers.size === 0 ? prepare(fallbackKeySpelling) : undefined;
  const prepareFor = (value: unknown): PreparedInterpreter => {
    if (shared) {
      return shared;
    }
    const instanceKeys = [...collectInstanceKeys(value)];
    const spellings = new Map<string, string>();
    return prepare(pattern => {
      const cached = spellings.get(pattern);
      if (cached !== undefined) {
        return cached;
      }
      const matcher = keyMatchers.get(pattern);
      const spelling =
        matcher === undefined
          ? fallbackKeySpelling(pattern)
          : literalKeysPattern(instanceKeys.filter(key => patternMatches(matcher, key)));
      spellings.set(pattern, spelling);
      return spelling;
    });
  };

  // Validate the source value before defaults and other Zod transforms run.
  // Otherwise a missing required field can be synthesized and incorrectly
  // appear valid to the JSON Schema interpreter.
  const innerGuard = (parsedSchema._def as GuardedDef).wholeSchemaGuard;
  const wholeSchemaGuard: WholeSchemaGuard = value => {
    // The interpreter only reads formats from its process-wide table. This
    // guard's pattern formats live there only for this synchronous call, so
    // the table does not grow with every distinct pattern ever converted.
    let result: ReturnType<Validator['validate']>;
    let prepared: PreparedInterpreter | undefined;
    try {
      prepared = prepareFor(value);
      prepared.formats.forEach((test, name) => {
        format[name] = test;
      });
      result = prepared.validator.validate(value);
    } catch (cause) {
      return `JSON Schema validation failed: ${String(cause)}`;
    } finally {
      prepared?.formats.forEach((_, name) => {
        delete format[name];
      });
    }

    if (!result.valid) {
      let error = result.errors[0]?.error ?? 'Input does not satisfy the complete JSON Schema.';
      // Report the schema's own pattern, not its per-value spelling.
      prepared.renamed.forEach((key, spelling) => {
        error = error.split(`"${spelling}"`).join(`"${key}"`);
      });
      return error;
    }
    return innerGuard?.(value);
  };

  const Guarded = guardedSchemaClass(parsedSchema.constructor as ZodSchemaClass);
  return new Guarded({ ...parsedSchema._def, wholeSchemaGuard } as GuardedDef);
};
