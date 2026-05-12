import { z } from 'zod/v3';
import { JsonSchemaRefResolutionError, JsonSchemaToZodError } from '../errors';
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';
import logger from './logger';
import { isPlainObject } from './modifiers/FileToolModifier.utils.neutral';

const MAX_REF_CHAIN_DEPTH = 100;
const MAX_NODE_DEPTH = 512;
const CYCLE_BREAK_SENTINEL = { type: 'object', additionalProperties: true } as const;
const POLLUTING_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const REF_RESOLUTION_FIXES = [
  'Ensure the $ref pointer matches a path in $defs or definitions',
  'External $ref pointers (http://, https://, file://, …) are not resolved by the SDK',
];

const decodePointerSegment = (segment: string): string =>
  segment.replace(/~1/g, '/').replace(/~0/g, '~');

const failResolution = (pointer: string, segment: string): never => {
  throw new JsonSchemaRefResolutionError(`Cannot resolve $ref ${pointer}`, {
    meta: { ref: pointer, failedAt: segment },
    possibleFixes: REF_RESOLUTION_FIXES,
  });
};

const stepInto = (cursor: unknown, segment: string, pointer: string): unknown => {
  if (cursor === null || typeof cursor !== 'object') failResolution(pointer, segment);
  if (Array.isArray(cursor)) {
    const i = Number(segment);
    if (!Number.isInteger(i) || i < 0 || i >= cursor.length) failResolution(pointer, segment);
    return cursor[i];
  }
  const obj = cursor as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(obj, segment)) failResolution(pointer, segment);
  return obj[segment];
};

const resolvePointer = (root: Record<string, unknown>, pointer: string): unknown => {
  if (pointer === '#' || pointer === '') return root;
  if (!pointer.startsWith('#/')) {
    throw new JsonSchemaRefResolutionError(`Unsupported $ref pointer: ${pointer}`, {
      meta: { ref: pointer },
      possibleFixes: REF_RESOLUTION_FIXES,
    });
  }
  return pointer
    .slice(2)
    .split('/')
    .map(decodePointerSegment)
    .reduce<unknown>((cursor, seg) => stepInto(cursor, seg, pointer), root);
};

/**
 * Inlines internal JSON Schema `$ref` pointers (`#/$defs/...` and legacy
 * `#/definitions/...`) so the returned schema can be safely handed to
 * consumers that don't tolerate unresolved references (e.g. AJV in
 * `@mastra/schema-compat`). External (`http://`, `https://`, …) refs are
 * left untouched. Cycles are broken with `{ type: 'object',
 * additionalProperties: true }`. The input is never mutated.
 *
 * @throws {JsonSchemaRefResolutionError} on malformed pointers, missing
 * targets, or chains past the depth cap.
 */
export function dereferenceJsonSchema<T = unknown>(schema: T): T {
  if (!isPlainObject(schema)) return schema;

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

      const target = resolvePointer(root, ref);
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
    additionalProperties?: boolean;
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
