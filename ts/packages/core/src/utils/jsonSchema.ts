import { z } from 'zod/v3';
import { JsonSchemaRefResolutionError, JsonSchemaToZodError } from '../errors';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';
import logger from './logger';
import { isPlainObject } from './modifiers/FileToolModifier.utils.neutral';

const MAX_REF_CHAIN_DEPTH = 100;
const MAX_NODE_DEPTH = 512;
const CYCLE_BREAK_SENTINEL = { type: 'object', additionalProperties: true } as const;

/** Keywords whose value is a single subschema. */
const SCHEMA_KEYWORDS = new Set([
  'additionalItems',
  'additionalProperties',
  'contains',
  'contentSchema',
  'else',
  'if',
  'not',
  'propertyNames',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties',
]);
/** Keywords whose value is an array of subschemas. */
const SCHEMA_ARRAY_KEYWORDS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
/** Keywords whose value is a map from name to subschema. */
const SCHEMA_MAP_KEYWORDS = new Set([
  '$defs',
  'definitions',
  'dependentSchemas',
  'patternProperties',
  'properties',
]);
/** Keywords whose values are instance data, never subschemas. */
const INSTANCE_VALUE_KEYWORDS = new Set(['const', 'default', 'enum', 'examples']);

/**
 * In-band hint attached to the cycle-break sentinel when lenient mode
 * substitutes it for a dangling `$ref`. Makes the degradation visible to
 * LLMs that read the wrapped tool's schema — without it the LLM sees a
 * useless permissive object and no prose context. Wording is intentionally
 * context-neutral ("Schema shape", not "Output shape") because the helper
 * is used for both `inputParameters` and `outputParameters`. Overridden
 * when the caller's `$ref` node carries its own `description` sibling
 * (Draft 2020-12 sibling-keyword semantics).
 */
const UNRESOLVED_REF_DESCRIPTION =
  'Schema shape unresolved at the source — validate loosely. ' +
  'See https://github.com/ComposioHQ/composio/issues/3307.';

/**
 * Strategy for `dereferenceJsonSchema` when an internal `$ref` cannot be
 * resolved (target missing under `$defs`/`definitions`, or a malformed
 * pointer beneath the internal `#/` prefix).
 *
 * - `'throw'` (default): throw `JsonSchemaRefResolutionError`. Right for
 *   first-party / custom-tool schemas where a dangling `$ref` is a developer
 *   bug worth surfacing.
 * - `'sentinel'`: replace the offending node with the cycle-break sentinel
 *   (`{ type: 'object', additionalProperties: true }`). Right for schemas
 *   sourced from an upstream service the caller cannot edit (e.g. an
 *   API-provided tool definition that emits `$ref` without a `$defs`
 *   block — see https://github.com/ComposioHQ/composio/issues/3307).
 *
 * Safety caps (`MAX_REF_CHAIN_DEPTH`, `MAX_NODE_DEPTH`) still throw in both
 * modes; cycle handling (already permissive via `CYCLE_BREAK_SENTINEL`) is
 * unaffected.
 */
export type UnresolvedRefStrategy = 'throw' | 'sentinel';

/**
 * Reason a `$ref` was replaced with the sentinel in `'sentinel'` mode.
 * `onReplace` callbacks receive this so callers can attribute the
 * fallback (e.g., warn at the offending tool slug).
 */
export type UnresolvedRefReason = 'missing-target' | 'malformed-pointer';

export interface DereferenceJsonSchemaOptions {
  onUnresolved?: UnresolvedRefStrategy;
  /**
   * Invoked once per replaced node in `'sentinel'` mode. The ref is the
   * original pointer string from the schema; reason distinguishes a
   * missing `$defs` target from a malformed pointer.
   */
  onReplace?: (ref: string, reason: UnresolvedRefReason) => void;
}
const POLLUTING_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const REF_RESOLUTION_FIXES = [
  'Ensure the $ref pointer matches a path in $defs or definitions',
  'External $ref pointers (http://, https://, file://, …) are not resolved by the SDK',
];

const decodePointerSegment = (segment: string): string =>
  segment.replace(/~1/g, '/').replace(/~0/g, '~');

/**
 * Tagged result of attempting to resolve a `$ref`. `failedAt` is populated
 * only for the segment-walk path so strict-mode error meta stays identical
 * to the pre-lenient-mode shape.
 */
type ResolutionResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'unresolved'; reason: UnresolvedRefReason; failedAt?: string };

const tryStep = (cursor: unknown, segment: string): ResolutionResult => {
  if (cursor === null || typeof cursor !== 'object') {
    return { kind: 'unresolved', reason: 'missing-target', failedAt: segment };
  }
  if (Array.isArray(cursor)) {
    const i = Number(segment);
    if (!Number.isInteger(i) || i < 0 || i >= cursor.length) {
      return { kind: 'unresolved', reason: 'missing-target', failedAt: segment };
    }
    return { kind: 'ok', value: cursor[i] };
  }
  const obj = cursor as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(obj, segment)) {
    return { kind: 'unresolved', reason: 'missing-target', failedAt: segment };
  }
  return { kind: 'ok', value: obj[segment] };
};

const tryResolvePointer = (root: Record<string, unknown>, pointer: string): ResolutionResult => {
  if (pointer === '#' || pointer === '') return { kind: 'ok', value: root };
  if (!pointer.startsWith('#/')) {
    return { kind: 'unresolved', reason: 'malformed-pointer' };
  }
  const segments = pointer.slice(2).split('/').map(decodePointerSegment);
  let cursor: unknown = root;
  for (const seg of segments) {
    const step = tryStep(cursor, seg);
    if (step.kind === 'unresolved') return step;
    cursor = step.value;
  }
  return { kind: 'ok', value: cursor };
};

const throwResolutionError = (
  pointer: string,
  result: Extract<ResolutionResult, { kind: 'unresolved' }>
): never => {
  if (result.reason === 'malformed-pointer') {
    throw new JsonSchemaRefResolutionError(`Unsupported $ref pointer: ${pointer}`, {
      meta: { ref: pointer },
      possibleFixes: REF_RESOLUTION_FIXES,
    });
  }
  throw new JsonSchemaRefResolutionError(`Cannot resolve $ref ${pointer}`, {
    meta: {
      ref: pointer,
      ...(result.failedAt !== undefined ? { failedAt: result.failedAt } : {}),
    },
    possibleFixes: REF_RESOLUTION_FIXES,
  });
};

/**
 * Inlines internal JSON Schema `$ref` pointers (`#/$defs/...` and legacy
 * `#/definitions/...`) so the returned schema can be safely handed to
 * consumers that don't tolerate unresolved references (e.g. AJV in
 * `@mastra/schema-compat`). External (`http://`, `https://`, …) refs are
 * left untouched. Cycles are broken with `{ type: 'object',
 * additionalProperties: true }`. The input is never mutated.
 *
 * By default, unresolved internal refs throw `JsonSchemaRefResolutionError`.
 * Pass `{ onUnresolved: 'sentinel' }` to replace the offending node with the
 * cycle-break sentinel instead — appropriate for schemas sourced from an
 * upstream service the caller cannot edit (the Composio API ships some
 * `outputParameters` with a `$ref` into `#/$defs/...` but never declares
 * `$defs`; see https://github.com/ComposioHQ/composio/issues/3307).
 *
 * @throws {JsonSchemaRefResolutionError} on malformed pointers, missing
 * targets (strict mode only), or chains past the depth cap (both modes).
 */
export function dereferenceJsonSchema<T = unknown>(
  schema: T,
  options?: DereferenceJsonSchemaOptions
): T {
  if (!isPlainObject(schema)) return schema;

  const strategy: UnresolvedRefStrategy = options?.onUnresolved ?? 'throw';
  const onReplace = options?.onReplace;

  const root = schema as Record<string, unknown>;
  const visiting = new WeakSet<object>();

  // POLLUTING_KEYS filter prevents an attacker-shaped $defs entry from altering
  // the cloned node's prototype.
  const cloneChildren = (
    obj: Record<string, unknown>,
    visitedRefs: ReadonlySet<string>,
    chainDepth: number,
    nodeDepth: number
  ): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(obj)
        .filter(([k]) => !POLLUTING_KEYS.has(k))
        .map(([k, v]) => [k, walk(v, visitedRefs, chainDepth, nodeDepth + 1)])
    );

  // `function` (not `const`) so `cloneChildren` above can call it via hoisting.
  function walk(
    node: unknown,
    visitedRefs: ReadonlySet<string>,
    chainDepth: number,
    nodeDepth: number
  ): unknown {
    if (nodeDepth >= MAX_NODE_DEPTH) {
      throw new JsonSchemaRefResolutionError(
        `JSON Schema node depth exceeded cap (${MAX_NODE_DEPTH})`,
        { possibleFixes: REF_RESOLUTION_FIXES }
      );
    }
    if (Array.isArray(node)) {
      if (visiting.has(node)) return { ...CYCLE_BREAK_SENTINEL };
      visiting.add(node);
      try {
        return node.map(item => walk(item, visitedRefs, chainDepth, nodeDepth + 1));
      } finally {
        visiting.delete(node);
      }
    }
    if (!isPlainObject(node)) return node;
    if (visiting.has(node)) return { ...CYCLE_BREAK_SENTINEL };
    visiting.add(node);
    try {
      const ref = typeof node.$ref === 'string' ? node.$ref : null;
      // External refs and non-$ref nodes both pass through the same clone path.
      if (ref === null || !ref.startsWith('#')) {
        if (ref !== null) {
          // Audit signal for security-sensitive deployments: a downstream
          // resolver may fetch this and trigger SSRF or local-file disclosure.
          logger.warn(`Leaving external $ref untouched: ${ref}`);
        }
        return cloneChildren(node, visitedRefs, chainDepth, nodeDepth);
      }

      if (chainDepth >= MAX_REF_CHAIN_DEPTH) {
        throw new JsonSchemaRefResolutionError(
          `JSON Schema $ref chain exceeded depth cap (${MAX_REF_CHAIN_DEPTH}): ${ref}`,
          { meta: { ref }, possibleFixes: REF_RESOLUTION_FIXES }
        );
      }
      if (visitedRefs.has(ref)) return { ...CYCLE_BREAK_SENTINEL };

      const result = tryResolvePointer(root, ref);
      let target: unknown;
      if (result.kind === 'ok') {
        target = result.value;
      } else if (strategy === 'sentinel') {
        // Lenient mode: replace the unresolved branch with the same
        // permissive sentinel used for cycles, and notify the caller so
        // they can emit a one-shot warn at the offending tool surface.
        // The injected `description` gives the LLM an in-band signal that
        // the branch is opaque; sibling-merge below will overwrite it with
        // a caller-provided description if the original node has one.
        onReplace?.(ref, result.reason);
        target = { ...CYCLE_BREAK_SENTINEL, description: UNRESOLVED_REF_DESCRIPTION };
      } else {
        throwResolutionError(ref, result);
      }
      const nextRefs = new Set(visitedRefs).add(ref);
      const resolved = walk(target, nextRefs, chainDepth + 1, nodeDepth + 1);

      // Shallow-merge sibling keywords (Draft 2020-12 semantics: siblings win
      // on collision). Draft 7 ignores siblings entirely, but the Composio
      // tool surface admits both drafts so we honor siblings for safety.
      const siblings: Record<string, unknown> = { ...node };
      delete siblings.$ref;
      if (Object.keys(siblings).length === 0 || !isPlainObject(resolved)) {
        return resolved;
      }
      return { ...resolved, ...cloneChildren(siblings, visitedRefs, chainDepth, nodeDepth) };
    } finally {
      visiting.delete(node);
    }
  }

  const out = walk(root, new Set(), 0, 0);
  if (isPlainObject(out)) {
    delete out.$defs;
    delete out.definitions;
  }
  return out as T;
}

/**
 * Returns a deep-cloned JSON Schema in which every node that carries a
 * `properties` keyword also carries `type: "object"` when it has no explicit
 * `type`. OpenAI tolerates the omission, but Google Gemini enforces OpenAPI
 * 3.0 strictly and rejects function declarations whose nested objects are
 * missing the `type` (see https://github.com/ComposioHQ/composio/issues/4022).
 *
 * The function follows JSON Schema's schema-bearing keywords while keeping
 * property maps and instance values as containers. Nodes that already declare
 * a `type` are left untouched.
 */
export function ensureObjectTypeOnProperties<T = unknown>(schema: T): T {
  type WalkMode = 'schema' | 'schema-array' | 'schema-map' | 'dependencies-map' | 'value';

  function walk(value: unknown, mode: WalkMode, depth = 0): unknown {
    if (depth > MAX_NODE_DEPTH) {
      throw new RangeError(`JSON Schema exceeds maximum nesting depth of ${MAX_NODE_DEPTH}`);
    }

    if (Array.isArray(value)) {
      const itemMode = mode === 'schema-array' ? 'schema' : 'value';
      return value.map(item => walk(item, itemMode, depth + 1));
    }

    if (!isPlainObject(value)) return value;

    const clone: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      let childMode: WalkMode = 'value';
      if (mode === 'schema-map') {
        childMode = 'schema';
      } else if (mode === 'dependencies-map') {
        childMode = Array.isArray(child) ? 'value' : 'schema';
      } else if (mode === 'schema') {
        if (SCHEMA_MAP_KEYWORDS.has(key)) {
          childMode = 'schema-map';
        } else if (SCHEMA_ARRAY_KEYWORDS.has(key) || (key === 'items' && Array.isArray(child))) {
          childMode = 'schema-array';
        } else if (SCHEMA_KEYWORDS.has(key) || key === 'items') {
          childMode = 'schema';
        } else if (key === 'dependencies') {
          childMode = 'dependencies-map';
        }
      }

      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        value: walk(child, childMode, depth + 1),
        writable: true,
      });
    }

    if (mode === 'schema' && clone.properties !== undefined && clone.type === undefined) {
      clone.type = 'object';
    }

    return clone;
  }

  return walk(schema, 'schema') as T;
}

/**
 * Returns a deep-cloned JSON Schema whose `required` arrays contain each entry
 * at most once. Duplicate entries are invalid in JSON Schema 2020-12 but do
 * not change the schema's meaning, so preserving the first occurrence is safe.
 *
 * Tool schemas originate both from the Composio API and direct provider calls.
 * Keeping this normalization provider-agnostic lets every SDK provider receive
 * canonical API schemas, while providers that further transform a schema can
 * reapply it at their own emission boundary.
 */
export function deduplicateJsonSchemaRequiredArrays<T = unknown>(schema: T): T {
  const seenSchemaValues = new WeakMap<object, unknown>();
  const seenInstanceValues = new WeakMap<object, unknown>();

  function walk(value: unknown, isSchema: boolean, depth = 0): unknown {
    if (depth > MAX_NODE_DEPTH) {
      throw new RangeError(`JSON Schema exceeds maximum nesting depth of ${MAX_NODE_DEPTH}`);
    }

    const seen = isSchema ? seenSchemaValues : seenInstanceValues;

    if (Array.isArray(value)) {
      const existing = seen.get(value);
      if (existing) return existing;

      const clone: unknown[] = [];
      seen.set(value, clone);
      for (const item of value) {
        clone.push(walk(item, isSchema, depth + 1));
      }
      return clone;
    }

    if (!isPlainObject(value)) return value;

    const existing = seen.get(value);
    if (existing) return existing;

    const clone: Record<string, unknown> = {};
    seen.set(value, clone);
    for (const [key, child] of Object.entries(value)) {
      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        value:
          isSchema && key === 'required' && Array.isArray(child)
            ? [...new Set(walk(child, false, depth + 1) as unknown[])]
            : walk(child, isSchema && !INSTANCE_VALUE_KEYWORDS.has(key), depth + 1),
        writable: true,
      });
    }
    return clone;
  }

  return walk(schema, true) as T;
}

/**
 * Removes all non-required properties from the schema
 *
 * if no items are required, the schema is returned as is
 * @param schema - The JSON schema to remove non-required properties from
 * @returns The JSON schema with all non-required properties removed
 */
export const removeNonRequiredProperties = <
  T extends {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: unknown;
  },
>(
  schema: T
): T => {
  if (schema && schema.type === 'object' && (schema.required as string[])?.length) {
    schema.properties = Object.fromEntries(
      Object.entries(schema.properties || {}).filter(([key]) =>
        (schema.required as string[]).includes(key)
      )
    );
  }
  // In strict mode, we don't allow additional properties
  schema.additionalProperties = false;
  return schema as T;
};

/**
 * Convert a JSON schema to a Zod schema
 * @param jsonSchema - The JSON schema to convert
 * @param strict - Eliminates all non-required properties from the schema
 * @returns The Zod schema
 *
 * @throws {JsonSchemaToZodError} If the JSON schema is invalid
 *
 * @example
 * ```ts
 * const zodSchema = jsonSchemaToZodSchema({
 *   type: 'object',
 *   properties: {
 *     name: { type: 'string' },
 *   },
 * });
 *
 * console.log(zodSchema);
 * ```
 *
 * @example
 * ```ts
 * const zodSchema = jsonSchemaToZodSchema({
 *   type: 'object',
 *   properties: {
 *     name: { type: 'string' },
 *     age: { type: 'number' },
 *   },
 *   required: ['name'],
 * }, { strict: true });
 *
 * console.log(zodSchema);
 *
 * // Output:
 * // z.object({
 * //   name: z.string(),
 * // })
 * ```
 */
export function jsonSchemaToZodSchema<T extends z.ZodTypeAny>(
  jsonSchema: Record<string, unknown>,
  { strict }: { strict?: boolean } = {
    strict: false,
  }
): T {
  try {
    let schema = jsonSchema;
    // Remove all non-required properties from the schema if strict is true
    if (strict && schema) {
      schema = removeNonRequiredProperties(
        schema as {
          type: 'object';
          properties: Record<string, unknown>;
          required?: string[] | undefined;
        }
      );
    }
    // Convert the JSON schema properties to Zod schema
    const zodSchema = jsonSchemaToZod(schema) as T;
    return zodSchema;
  } catch (error) {
    throw new JsonSchemaToZodError('Failed to convert JSON Schema to Zod Schema', {
      cause: error,
    });
  }
}

/**
 * Reason recorded when strict normalization rewrites a schema node. Every
 * rewrite is lossless: the model can still express the same values.
 *
 * - `optional-property-nullable` — a property missing from `required` was
 *   added to it and widened to accept `null`, the emulation of optional
 *   fields that OpenAI structured outputs document.
 * - `unsupported-keyword-stripped` — an annotation keyword the API rejects
 *   (`default`, `examples`) was removed.
 * - `one-of-converted` — `oneOf` (unsupported) became `anyOf`.
 */
export type StrictSchemaChangeReason =
  'optional-property-nullable' | 'unsupported-keyword-stripped' | 'one-of-converted';

/** A single lossless rewrite applied by {@link toStrictJsonSchema}. */
export interface StrictSchemaChange {
  /** Path to the changed node relative to the root, e.g. `properties.cfg.items`. */
  path: string;
  reason: StrictSchemaChangeReason;
  /** Human-readable detail about what specifically changed. */
  detail?: string;
}

/**
 * A schema construct strict structured outputs cannot express. Rewriting it
 * would change what the tool accepts, so it is reported instead; providers
 * send such a tool without strict mode.
 */
export interface StrictSchemaIncompatibility {
  /** Path to the offending node relative to the root. */
  path: string;
  /** The keyword (or `$ref`) that has no strict-mode equivalent. */
  keyword: string;
  detail: string;
}

/** Result of {@link toStrictJsonSchema}. */
export interface StrictJsonSchemaResult {
  /**
   * The strict schema. Only usable when `unsupported` is empty; otherwise it
   * is best-effort and the original schema should be sent without strict mode.
   */
  schema: Record<string, unknown>;
  /**
   * The input schema the rewrite was computed from. Optionality is decided
   * against this schema, so it is what `omitNullToolArguments` needs.
   */
  source: Record<string, unknown>;
  /** Lossless rewrites, capped at 50 entries; see `totalChanges`. */
  changes: StrictSchemaChange[];
  totalChanges: number;
  /** Constructs strict mode cannot express. Non-empty means "do not use `schema`". */
  unsupported: StrictSchemaIncompatibility[];
}

const MAX_STRICT_CHANGES = 50;

/** Annotation-only keywords OpenAI structured outputs rejects; safe to strip. */
const STRICT_STRIP_KEYWORDS = new Set(['examples', 'default']);

/** Keywords OpenAI structured outputs reject and that have no lossless rewrite. */
const STRICT_UNSUPPORTED_KEYWORDS = [
  'allOf',
  'prefixItems',
  'additionalItems',
  'contains',
  'dependencies',
  'dependentSchemas',
  'else',
  'if',
  'not',
  'propertyNames',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties',
];

/** Whether a `type` value declares exactly the object type. */
const isObjectType = (type: unknown): boolean =>
  type === 'object' || (Array.isArray(type) && type.length === 1 && type[0] === 'object');

type StrictWalkMode = 'schema' | 'schema-array' | 'schema-map' | 'value';

const joinPath = (parent: string, key: string): string => (parent ? `${parent}.${key}` : key);

/**
 * Sets an own property regardless of its name: a plain assignment to a key
 * such as `__proto__` would set the prototype instead of storing the value.
 */
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

/**
 * Widens a property schema so that `null` is an accepted value, without
 * placing `type` beside `anyOf` (the API rejects that combination).
 */
function widenToNullable(node: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(node.anyOf)) {
    const alreadyNullable = node.anyOf.some(
      branch => isPlainObject(branch) && branch.type === 'null'
    );
    return alreadyNullable ? node : { ...node, anyOf: [...node.anyOf, { type: 'null' }] };
  }
  if (typeof node.type === 'string') {
    return node.type === 'null' ? node : { ...node, type: [node.type, 'null'] };
  }
  if (Array.isArray(node.type)) {
    return node.type.includes('null') ? node : { ...node, type: [...node.type, 'null'] };
  }
  if ((Array.isArray(node.enum) && node.enum.includes(null)) || node.const === null) return node;
  // No `type` at all: an empty schema already accepts null; anything else
  // (enum-only, const, composition) is wrapped so the annotation stays outside.
  const { description, title, ...rest } = node;
  if (Object.keys(rest).length === 0) return node;
  return {
    ...(description !== undefined ? { description } : {}),
    ...(title !== undefined ? { title } : {}),
    anyOf: [rest, { type: 'null' }],
  };
}

/**
 * Follows local `$ref` pointers from `node` until a concrete schema node is
 * reached. Unresolvable or over-long chains return the last node seen.
 */
function resolveLocalRefs(node: unknown, root: Record<string, unknown>): unknown {
  let current = node;
  for (let hops = 0; hops < MAX_REF_CHAIN_DEPTH; hops++) {
    if (!isPlainObject(current) || typeof current.$ref !== 'string') return current;
    const resolution = tryResolvePointer(root, current.$ref);
    if (resolution.kind === 'unresolved') return current;
    current = resolution.value;
  }
  return current;
}

/** Whether a schema node accepts `null` as an instance. */
function schemaAcceptsNull(schema: unknown, root: Record<string, unknown>): boolean {
  const node = resolveLocalRefs(schema, root);
  if (!isPlainObject(node)) return true;
  if (typeof node.type === 'string') return node.type === 'null';
  if (Array.isArray(node.type)) return node.type.includes('null');
  if (Array.isArray(node.enum)) return node.enum.includes(null);
  if ('const' in node) return node.const === null;
  for (const keyword of ['anyOf', 'oneOf']) {
    const branches = node[keyword];
    if (Array.isArray(branches)) return branches.some(branch => schemaAcceptsNull(branch, root));
  }
  return true;
}

/**
 * Normalizes a tool parameter schema for OpenAI structured outputs
 * (`strict: true`) at every depth, following the contract OpenAI documents:
 *
 *  - every object lists all of its properties in `required` and sets
 *    `additionalProperties: false`;
 *  - properties that were optional stay available and are widened to accept
 *    `null` (`type: ['string', 'null']`, or an extra `anyOf` branch) — the
 *    documented way to emulate optional fields. Nothing is dropped, so the
 *    model keeps every parameter it could pass before. A `null` the model
 *    sends for such a property means "omitted"; the strict providers drop it
 *    before executing the tool (see {@link omitNullToolArguments});
 *  - `type` arrays are kept as-is (the API accepts them); `oneOf` becomes
 *    `anyOf`; `default` and `examples` are stripped;
 *  - local `$ref`s into `$defs`/`definitions` are kept (the API supports
 *    them, including recursion) and the definitions themselves are
 *    normalized; an optional `$ref` property is widened with an `anyOf`
 *    null branch;
 *  - constructs strict mode cannot express — objects that accept arbitrary
 *    keys (schema-valued or `true` `additionalProperties`, `patternProperties`,
 *    property-less free-form objects), boolean subschemas, `allOf`,
 *    `prefixItems`, tuple-form `items`, conditional and dependency keywords,
 *    external or dangling `$ref`s, and a non-object root — are reported in
 *    `unsupported` rather than rewritten into something narrower. Callers send
 *    such a tool without strict mode.
 *
 * The input is never mutated. Every rewrite is recorded in `changes` (capped
 * at 50 entries; `totalChanges` carries the real count), and `required`
 * arrays are de-duplicated at the end.
 */
export function toStrictJsonSchema(schema: unknown): StrictJsonSchemaResult {
  const changes: StrictSchemaChange[] = [];
  const unsupported: StrictSchemaIncompatibility[] = [];
  let totalChanges = 0;
  const recordChange = (change: StrictSchemaChange): void => {
    totalChanges += 1;
    if (changes.length < MAX_STRICT_CHANGES) changes.push(change);
  };

  const root: Record<string, unknown> = isPlainObject(schema) ? schema : {};

  function walkChildren(
    node: Record<string, unknown>,
    mode: StrictWalkMode,
    depth: number,
    path: string
  ): Record<string, unknown> {
    const clone: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node)) {
      let childMode: StrictWalkMode = 'value';
      if (mode === 'schema-map') {
        childMode = 'schema';
      } else if (mode === 'schema' && !INSTANCE_VALUE_KEYWORDS.has(key)) {
        if (SCHEMA_MAP_KEYWORDS.has(key)) {
          childMode = 'schema-map';
        } else if (SCHEMA_ARRAY_KEYWORDS.has(key) || (key === 'items' && Array.isArray(child))) {
          childMode = 'schema-array';
        } else if (SCHEMA_KEYWORDS.has(key) || key === 'items') {
          childMode = 'schema';
        }
      }

      if (childMode === 'schema-map' && isPlainObject(child)) {
        const mapClone: Record<string, unknown> = {};
        for (const [name, subSchema] of Object.entries(child)) {
          setOwn(
            mapClone,
            name,
            walk(subSchema, 'schema', depth + 1, joinPath(joinPath(path, key), name))
          );
        }
        setOwn(clone, key, mapClone);
        continue;
      }
      setOwn(clone, key, walk(child, childMode, depth + 1, joinPath(path, key)));
    }
    return clone;
  }

  function walk(value: unknown, mode: StrictWalkMode, depth: number, path: string): unknown {
    if (depth > MAX_NODE_DEPTH) {
      throw new RangeError(`JSON Schema exceeds maximum nesting depth of ${MAX_NODE_DEPTH}`);
    }
    if (Array.isArray(value)) {
      const itemMode = mode === 'schema-array' ? 'schema' : 'value';
      return value.map((item, index) => walk(item, itemMode, depth + 1, `${path}[${index}]`));
    }
    if (!isPlainObject(value) || mode === 'value') return value;

    const node: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (STRICT_STRIP_KEYWORDS.has(key)) {
        recordChange({
          path,
          reason: 'unsupported-keyword-stripped',
          detail: `keyword "${key}" removed`,
        });
        continue;
      }
      setOwn(node, key, child);
    }
    if (Array.isArray(node.oneOf) && node.anyOf === undefined) {
      node.anyOf = node.oneOf;
      delete node.oneOf;
      recordChange({ path, reason: 'one-of-converted', detail: 'oneOf became anyOf' });
    }
    for (const keyword of STRICT_UNSUPPORTED_KEYWORDS) {
      if (node[keyword] !== undefined) {
        unsupported.push({
          path,
          keyword,
          detail: `"${keyword}" has no strict-mode equivalent`,
        });
      }
    }
    if (node.oneOf !== undefined) {
      unsupported.push({ path, keyword: 'oneOf', detail: 'oneOf beside anyOf cannot be merged' });
    }
    if (Array.isArray(node.items)) {
      unsupported.push({
        path,
        keyword: 'items',
        detail: 'tuple-form items has no strict-mode equivalent',
      });
    } else if (typeof node.items === 'boolean') {
      unsupported.push({ path, keyword: 'items', detail: 'boolean subschema' });
    }
    if (node.properties !== undefined && !isPlainObject(node.properties)) {
      unsupported.push({ path, keyword: 'properties', detail: 'properties is not an object' });
    }

    const out = walkChildren(node, mode, depth, path);

    if (typeof node.$ref === 'string') {
      const resolution =
        node.$ref === '#' || node.$ref.startsWith('#/')
          ? tryResolvePointer(root, node.$ref)
          : ({ kind: 'unresolved', reason: 'malformed-pointer' } as const);
      if (resolution.kind === 'unresolved') {
        unsupported.push({
          path,
          keyword: '$ref',
          detail: `unresolved $ref "${node.$ref}"`,
        });
      }
      // The referenced definition is normalized where it is declared.
      return out;
    }

    const declaresObjectType =
      out.type === 'object' || (Array.isArray(out.type) && out.type.includes('object'));
    if (!declaresObjectType && !isPlainObject(out.properties)) return out;
    if (out.properties !== undefined && !isPlainObject(out.properties)) return out;

    const properties: Record<string, unknown> = {};
    if (isPlainObject(out.properties)) {
      for (const [name, propertySchema] of Object.entries(out.properties)) {
        setOwn(properties, name, propertySchema);
      }
    }
    const declaredRequired = new Set(
      Array.isArray(out.required) ? out.required.filter(entry => typeof entry === 'string') : []
    );
    for (const [name, propertySchema] of Object.entries(properties)) {
      if (typeof propertySchema === 'boolean') {
        unsupported.push({
          path: joinPath(path, `properties.${name}`),
          keyword: 'properties',
          detail: 'boolean subschema',
        });
        continue;
      }
      if (declaredRequired.has(name) || !isPlainObject(propertySchema)) continue;
      setOwn(properties, name, widenToNullable(propertySchema));
      recordChange({
        path: joinPath(path, `properties.${name}`),
        reason: 'optional-property-nullable',
        detail: `property "${name}" is now required and accepts null`,
      });
    }

    const acceptsDynamicKeys =
      out.additionalProperties === true || isPlainObject(out.additionalProperties);
    if (acceptsDynamicKeys) {
      unsupported.push({
        path,
        keyword: 'additionalProperties',
        detail: 'object accepts arbitrary keys',
      });
    } else if (out.patternProperties !== undefined) {
      unsupported.push({
        path,
        keyword: 'patternProperties',
        detail: 'object accepts pattern-matched keys',
      });
    } else if (Object.keys(properties).length === 0 && out.additionalProperties === undefined) {
      unsupported.push({
        path,
        keyword: 'properties',
        detail: 'free-form object accepts arbitrary keys',
      });
    }

    return {
      ...out,
      ...(out.type === undefined ? { type: 'object' } : {}),
      properties,
      required: Object.keys(properties),
      ...(acceptsDynamicKeys ? {} : { additionalProperties: false }),
    };
  }

  const normalized = walk(root, 'schema', 0, '');
  if (!isPlainObject(normalized) || !isObjectType(normalized.type)) {
    unsupported.push({
      path: '',
      keyword: 'type',
      detail: 'root must be a non-nullable object',
    });
  }

  return {
    schema: deduplicateJsonSchemaRequiredArrays(normalized) as Record<string, unknown>,
    source: root,
    changes,
    totalChanges,
    unsupported,
  };
}

/**
 * Drops `null`-valued arguments that the tool's own schema does not accept,
 * recursively through nested objects and arrays.
 *
 * Strict structured outputs cannot express optional parameters, so
 * {@link toStrictJsonSchema} makes every parameter required and nullable. The
 * model then sends `null` for a parameter it would otherwise have omitted;
 * forwarding that `null` to the tool would fail validation against the tool's
 * real schema, so it is treated as "omitted". A `null` the original schema
 * accepts (a nullable field, an explicit "clear this value") is kept.
 *
 * @param args - Normalized tool arguments.
 * @param schema - The dereferenced tool parameter schema the arguments were
 *   produced for (`StrictJsonSchemaResult.source`).
 * @returns A new object; the input is not mutated.
 */
export function omitNullToolArguments(
  args: Record<string, unknown>,
  schema: unknown
): Record<string, unknown> {
  const root: Record<string, unknown> = isPlainObject(schema) ? schema : {};
  return omitNulls(args, root, root, 0) as Record<string, unknown>;
}

/**
 * Picks the composition branch that describes a value's shape: the first
 * branch with `properties` for an object, the first with `items` for an
 * array. Nodes without a composition are returned as they are.
 */
function selectBranchFor(
  schema: unknown,
  value: unknown,
  root: Record<string, unknown>
): Record<string, unknown> | undefined {
  const resolved = resolveLocalRefs(schema, root);
  if (!isPlainObject(resolved)) return undefined;
  const wanted = Array.isArray(value) ? 'items' : 'properties';
  const find = (node: unknown, depth: number): Record<string, unknown> | undefined => {
    const candidate = resolveLocalRefs(node, root);
    if (!isPlainObject(candidate) || depth > MAX_NODE_DEPTH) return undefined;
    if (candidate[wanted] !== undefined) return candidate;
    for (const keyword of ['anyOf', 'oneOf']) {
      const branches = candidate[keyword];
      if (!Array.isArray(branches)) continue;
      for (const branch of branches) {
        const found = find(branch, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  };
  return find(resolved, 0) ?? resolved;
}

function omitNulls(
  value: unknown,
  schema: unknown,
  root: Record<string, unknown>,
  depth: number
): unknown {
  if (depth > MAX_NODE_DEPTH) {
    throw new RangeError(`Tool arguments exceed maximum nesting depth of ${MAX_NODE_DEPTH}`);
  }
  const node = selectBranchFor(schema, value, root);
  if (Array.isArray(value)) {
    const items = node && isPlainObject(node.items) ? node.items : undefined;
    return value.map(item => omitNulls(item, items, root, depth + 1));
  }
  if (!isPlainObject(value)) return value;

  const properties = node && isPlainObject(node.properties) ? node.properties : {};
  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const propertySchema = Object.prototype.hasOwnProperty.call(properties, key)
      ? properties[key]
      : undefined;
    if (child === null) {
      if (propertySchema === undefined || schemaAcceptsNull(propertySchema, root)) {
        setOwn(clone, key, child);
      }
      continue;
    }
    setOwn(clone, key, omitNulls(child, propertySchema, root, depth + 1));
  }
  return clone;
}
