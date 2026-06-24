/**
 * JSON-schema property-key sanitization.
 *
 * Some providers constrain the characters and/or length of tool `input_schema`
 * property keys (e.g. Anthropic's Messages API validates every key against
 * `^[a-zA-Z0-9_.-]{1,64}$` and rejects the whole `tools` array on a single
 * violation). Composio tool schemas can surface keys that break such rules —
 * OData parameters like `$top` / `@microsoft.graph.conflictBehavior`, or
 * over-long `__`-flattened keys.
 *
 * This module rewrites offending keys to conforming aliases before the schema is
 * sent to the provider, and records a reverse mapping so the original parameter
 * names can be restored before a tool call is executed against the Composio
 * backend. The *constraint* (which keys are valid and how an illegal key is
 * rewritten) is injected as a {@link KeySanitizationPolicy} so the mechanism
 * stays provider-agnostic; the traversal, collision handling, reverse mapping,
 * prototype safety and depth cap live here.
 *
 * The reverse mapping mirrors the schema's nesting (object `properties`, array
 * `items`/`prefixItems`, and the composition keywords `allOf`/`anyOf`/`oneOf` /
 * `not`/`if`/`then`/`else`, whose renames fold into the value level they share)
 * rather than being a single flat lookup. This matters because an alias generated
 * at one nesting level (e.g. `$top` -> `dollar_top`) must not rewrite a
 * legitimately-named `dollar_top` key that happens to exist at a different level.
 * Keys nested only under dynamic / `$ref` positions (`additionalProperties`,
 * `patternProperties`, `$defs`/`definitions`, `contains`) are still rewritten so
 * the provider accepts the schema, but are not restored — see the keyword lists
 * below. Dereferencing the schema first (see `dereferenceJsonSchema`) inlines
 * `$ref`/`$defs` into restorable value positions, shrinking that residual gap.
 *
 * @packageDocumentation
 * @module utils/schemaPropertyKeys
 */

import { isPlainObject } from './modifiers/FileToolModifier.utils.neutral';

/** Maximum schema nesting we traverse, matching `dereferenceJsonSchema`'s cap. */
const MAX_SCHEMA_DEPTH = 512;

/**
 * Provider-specific key constraint. The mechanism reserves every already-valid
 * sibling key before aliasing, so {@link aliasKey} only needs to produce a
 * conforming alias that is distinct from the supplied `taken` set.
 */
export interface KeySanitizationPolicy {
  /** Whether a key already conforms to the provider's constraint. */
  isValidKey(key: string): boolean;
  /**
   * Produce a conforming alias for an illegal `key`, guaranteed distinct from
   * every entry in `taken` (the already-assigned keys at the same object level).
   */
  aliasKey(key: string, taken: ReadonlySet<string>): string;
}

/**
 * Reverse mapping used to restore original property names at execution time.
 *
 * It is shaped like the schema it was derived from so restoration is scoped to
 * the exact location a rename happened:
 *  - `renames` — `sanitized -> original` for keys renamed at *this* value level
 *    (including renames folded in from composition keywords).
 *  - `children` — restoration mapping for the value under each (sanitized) key,
 *    keyed by the sanitized key. Only present for children that contain renames.
 *  - `items` — restoration mapping for array element values. A single mapping
 *    applies to every element; an array of mappings applies positionally (JSON
 *    Schema tuple validation / `prefixItems`). Only present when array elements
 *    contain renames.
 *  - `restItems` — restoration mapping for array elements *past* a positional
 *    `items`/`prefixItems` tuple (a 2020-12 single `items` schema sitting next to
 *    `prefixItems`). Only present when those trailing elements contain renames.
 */
export interface KeyMapping {
  renames: Record<string, string>;
  children: Record<string, KeyMapping>;
  items?: KeyMapping | (KeyMapping | null)[];
  restItems?: KeyMapping;
}

/** Whether a mapping (or any of its descendants) actually renames a key. */
export function mappingHasRenames(mapping: KeyMapping): boolean {
  // `children` and `items` are only populated when they carry renames (see
  // `sanitizeNode`), so this stays a shallow check.
  return (
    Object.keys(mapping.renames).length > 0 ||
    Object.keys(mapping.children).length > 0 ||
    mapping.items != null ||
    mapping.restItems != null
  );
}

/**
 * Composition/applicator keywords whose sub-schema(s) constrain the *same* value
 * as the parent. Property-key renames generated inside them are merged into the
 * parent's value level, because the value carries no extra nesting for these
 * keywords. `not`/`if`/`then`/`else` hold a single sub-schema; `allOf`/`anyOf`/
 * `oneOf` hold an array of sub-schemas.
 */
const COMPOSITION_SINGLE_KEYWORDS = ['not', 'if', 'then', 'else'] as const;
const COMPOSITION_LIST_KEYWORDS = ['allOf', 'anyOf', 'oneOf'] as const;

/**
 * Positions whose nested keys are rewritten so the provider accepts the schema,
 * but which we cannot tie to a concrete value position for restoration: dynamic
 * keys (`additionalProperties`, `patternProperties`) and `$ref` targets (`$defs`/
 * `definitions`, unresolved unless the caller dereferences first), plus
 * `contains`. A value filled via an alias generated here reaches the backend
 * un-restored — strictly better than the whole `tools` array being rejected.
 */
const REWRITE_ONLY_SINGLE_KEYWORDS = ['additionalProperties', 'contains'] as const;
const REWRITE_ONLY_MAP_KEYWORDS = ['patternProperties', '$defs', 'definitions'] as const;

/**
 * Sanitizes a single sub-schema. Returns the rewritten node and its mapping, or
 * a `null` mapping when nothing inside it was renamed (keeps mappings sparse).
 */
function sanitizeSubschema(
  value: unknown,
  policy: KeySanitizationPolicy,
  depth: number
): { node: unknown; mapping: KeyMapping | null } {
  if (!isPlainObject(value)) {
    return { node: value, mapping: null };
  }
  const { node, mapping } = sanitizeNode(value, policy, depth + 1);
  return { node, mapping: mappingHasRenames(mapping) ? mapping : null };
}

/** Sanitizes an array of positional sub-schemas (tuple `items` / `prefixItems`). */
function sanitizeTuple(
  entries: unknown[],
  policy: KeySanitizationPolicy,
  depth: number
): { nodes: unknown[]; mappings: (KeyMapping | null)[] | undefined } {
  const nodes: unknown[] = [];
  const mappings: (KeyMapping | null)[] = [];
  let anyRenamed = false;
  for (const entry of entries) {
    const { node, mapping } = sanitizeSubschema(entry, policy, depth);
    nodes.push(node);
    mappings.push(mapping);
    if (mapping) anyRenamed = true;
  }
  return { nodes, mappings: anyRenamed ? mappings : undefined };
}

/**
 * Rewrites the nested keys of a `{ name -> sub-schema }` map (e.g. `$defs`,
 * `patternProperties`). The map's own keys are names/patterns, not value
 * property keys, so they are left untouched and no restoration mapping is kept.
 */
function sanitizeSchemaMap(
  map: Record<string, unknown>,
  policy: KeySanitizationPolicy,
  depth: number
): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(map)) {
    out[key] = sanitizeSubschema(value, policy, depth).node;
  }
  return out;
}

/**
 * Merges `source`'s renames into `target`, both describing the same value level
 * (used to fold composition branches into their parent). `target` wins on
 * conflict, since it is the more direct (`properties`-level) mapping.
 *
 * Known limitation: folding sibling `allOf`/`anyOf`/`oneOf` branches into one
 * value level is lossy when two branches disagree on an alias. If branch A aliases
 * an illegal key to `X` while branch B has a distinct illegal key that also aliases
 * to `X` — or a *legitimate* property literally named `X` — only the first-seen
 * entry survives, so an argument that satisfied the other branch restores to the
 * wrong original name. Which branch a runtime value matched can't be recovered from
 * the value alone (that needs full schema evaluation against the value), so these
 * cross-branch collisions stay effectively rewrite-only — still strictly better
 * than the whole `tools` array being rejected. They are rare in practice.
 */
function mergeMappingInto(target: KeyMapping, source: KeyMapping): void {
  for (const [alias, original] of Object.entries(source.renames)) {
    if (!(alias in target.renames)) {
      target.renames[alias] = original;
    }
  }
  for (const [key, childSource] of Object.entries(source.children)) {
    const existing = target.children[key];
    if (existing) {
      mergeMappingInto(existing, childSource);
    } else {
      target.children[key] = childSource;
    }
  }
  if (target.items === undefined && source.items !== undefined) {
    target.items = source.items;
    if (source.restItems !== undefined) {
      target.restItems = source.restItems;
    }
  }
}

/**
 * Recursively sanitizes the property keys of a JSON-schema node, returning the
 * rewritten node and a {@link KeyMapping} shaped like the node. Traversal covers
 * object `properties`, array `items`/`prefixItems`, the composition keywords
 * (`allOf`/`anyOf`/`oneOf`, `not`/`if`/`then`/`else` — whose renames merge into
 * this level), and the rewrite-only positions in {@link REWRITE_ONLY_SINGLE_KEYWORDS}
 * / {@link REWRITE_ONLY_MAP_KEYWORDS}.
 *
 * The input node is never mutated; a new node is returned.
 */
function sanitizeNode(
  node: Record<string, unknown>,
  policy: KeySanitizationPolicy,
  depth = 0
): {
  node: Record<string, unknown>;
  mapping: KeyMapping;
} {
  if (depth >= MAX_SCHEMA_DEPTH) {
    throw new Error(
      `Tool schema nesting exceeded the maximum supported depth (${MAX_SCHEMA_DEPTH})`
    );
  }

  const result: Record<string, unknown> = { ...node };
  // Lookup/result tables are prototype-free so a property key that collides with
  // an `Object.prototype` member (`__proto__`, `constructor`, `toString`, …)
  // becomes a plain own entry instead of resolving to (or reparenting via) the
  // inherited member. Mirrors the `POLLUTING_KEYS` defense in `jsonSchema.ts`.
  const renames: Record<string, string> = Object.create(null);
  const children: Record<string, KeyMapping> = Object.create(null);
  const mapping: KeyMapping = { renames, children };

  const properties = node.properties;
  if (isPlainObject(properties)) {
    const newProperties: Record<string, unknown> = Object.create(null);
    const renamedOriginalToSanitized: Record<string, string> = Object.create(null);

    // Reserve all already-valid keys up front so they keep their exact names and
    // sanitized aliases are generated around them (a valid `dollar_top` must not
    // be clobbered by a sanitized `$top`).
    const taken = new Set<string>();
    for (const key of Object.keys(properties)) {
      if (policy.isValidKey(key)) {
        taken.add(key);
      }
    }

    for (const [key, rawValue] of Object.entries(properties)) {
      const safeKey = policy.isValidKey(key) ? key : policy.aliasKey(key, taken);
      taken.add(safeKey);

      const { node: childNode, mapping: childMapping } = sanitizeSubschema(rawValue, policy, depth);
      newProperties[safeKey] = childNode;
      if (childMapping) {
        children[safeKey] = childMapping;
      }

      if (safeKey !== key) {
        renames[safeKey] = key;
        renamedOriginalToSanitized[key] = safeKey;
      }
    }

    result.properties = newProperties;

    // Keep `required` in sync with the renamed keys at this level.
    if (Array.isArray(node.required)) {
      result.required = node.required.map(name =>
        typeof name === 'string' && renamedOriginalToSanitized[name]
          ? renamedOriginalToSanitized[name]
          : name
      );
    }
  }

  // Array element schemas come from up to two positional sources — a Draft-7
  // `items` tuple and the 2020-12 `prefixItems` tuple — plus one "applies to every
  // element" source, a single `items` schema. When `prefixItems` provides the
  // positional mapping, a sibling single `items` schema constrains the elements
  // *past* the tuple (2020-12 semantics); its renames are kept separately as
  // `restItems` so those tail elements restore too instead of being dropped (or
  // the rest mapping bleeding onto the tuple positions). Restoration reaches array
  // elements through `mapping.items`/`mapping.restItems` — a `properties`-only walk
  // would let illegal keys nested in elements through and still be rejected.
  const itemsSchema = node.items;
  let positionalItems: (KeyMapping | null)[] | undefined;
  let uniformItems: KeyMapping | undefined;
  if (isPlainObject(itemsSchema)) {
    const { node: childNode, mapping: childMapping } = sanitizeSubschema(
      itemsSchema,
      policy,
      depth
    );
    result.items = childNode;
    if (childMapping) {
      uniformItems = childMapping;
    }
  } else if (Array.isArray(itemsSchema)) {
    const { nodes, mappings } = sanitizeTuple(itemsSchema, policy, depth);
    result.items = nodes;
    positionalItems = mappings;
  }
  if (Array.isArray(node.prefixItems)) {
    const { nodes, mappings } = sanitizeTuple(node.prefixItems, policy, depth);
    result.prefixItems = nodes;
    // `prefixItems` is the 2020-12 positional keyword; use it for the positional
    // mapping when a Draft-7 `items` tuple didn't already provide one.
    if (positionalItems === undefined) {
      positionalItems = mappings;
    }
  }
  if (positionalItems) {
    mapping.items = positionalItems;
    // A single `items` schema sitting next to a `prefixItems` tuple describes the
    // elements after the tuple; keep its mapping so they restore positionally.
    if (uniformItems && Array.isArray(node.prefixItems)) {
      mapping.restItems = uniformItems;
    }
  } else if (uniformItems) {
    mapping.items = uniformItems;
  }

  // Composition keywords constrain the *same* value, so renames generated inside
  // them are merged into this level (the value has no extra nesting for them).
  for (const keyword of COMPOSITION_SINGLE_KEYWORDS) {
    const sub = node[keyword];
    if (isPlainObject(sub)) {
      const { node: childNode, mapping: childMapping } = sanitizeSubschema(sub, policy, depth);
      result[keyword] = childNode;
      if (childMapping) {
        mergeMappingInto(mapping, childMapping);
      }
    }
  }
  for (const keyword of COMPOSITION_LIST_KEYWORDS) {
    const list = node[keyword];
    if (Array.isArray(list)) {
      result[keyword] = list.map(entry => {
        const { node: childNode, mapping: childMapping } = sanitizeSubschema(entry, policy, depth);
        if (childMapping) {
          mergeMappingInto(mapping, childMapping);
        }
        return childNode;
      });
    }
  }

  // Rewrite-only positions: keys are made compliant, but no restoration mapping
  // is kept (see the keyword lists above for why).
  for (const keyword of REWRITE_ONLY_SINGLE_KEYWORDS) {
    const sub = node[keyword];
    if (isPlainObject(sub)) {
      result[keyword] = sanitizeSubschema(sub, policy, depth).node;
    }
  }
  for (const keyword of REWRITE_ONLY_MAP_KEYWORDS) {
    const sub = node[keyword];
    if (isPlainObject(sub)) {
      result[keyword] = sanitizeSchemaMap(sub, policy, depth);
    }
  }

  return { node: result, mapping };
}

/**
 * Sanitizes a tool `input_schema` so all property keys conform to `policy`.
 *
 * @param schema - The tool input schema to sanitize.
 * @param policy - Provider constraint describing valid keys and how to rewrite
 *                 illegal ones.
 * @returns The sanitized schema (a copy) and a {@link KeyMapping} for restoring
 *          the original keys. Use {@link mappingHasRenames} to tell whether
 *          anything was rewritten.
 */
export function sanitizeSchemaPropertyKeys<T extends Record<string, unknown>>(
  schema: T,
  policy: KeySanitizationPolicy
): { schema: T; mapping: KeyMapping } {
  const { node, mapping } = sanitizeNode(schema, policy);
  return { schema: node as T, mapping };
}

/**
 * Restores original property names in a tool-call argument object using the
 * mapping produced by {@link sanitizeSchemaPropertyKeys}. The mapping is walked
 * in lockstep with the value, so a key is only renamed at the nesting level where
 * its alias was actually generated. Nested objects and arrays are handled
 * recursively. Returns a new value; the input is not mutated.
 */
export function restoreOriginalKeys(value: unknown, mapping: KeyMapping, depth = 0): unknown {
  if (depth >= MAX_SCHEMA_DEPTH) {
    throw new Error(
      `Tool arguments nesting exceeded the maximum supported depth (${MAX_SCHEMA_DEPTH})`
    );
  }

  if (Array.isArray(value)) {
    const { items, restItems } = mapping;
    if (Array.isArray(items)) {
      return value.map((item, index) => {
        // Elements inside the tuple use their positional mapping; elements past it
        // use the trailing single-`items` rest mapping (2020-12), if any.
        const itemMapping = index < items.length ? items[index] : restItems;
        return itemMapping ? restoreOriginalKeys(item, itemMapping, depth + 1) : item;
      });
    }
    if (items) {
      return value.map(item => restoreOriginalKeys(item, items, depth + 1));
    }
    return value;
  }

  if (isPlainObject(value)) {
    // Prototype-free so a model-supplied key equal to an `Object.prototype`
    // member name (`__proto__`, `constructor`, …) is written as a plain own
    // property rather than reparenting the result or hitting an inherited member.
    const restored: Record<string, unknown> = Object.create(null);
    for (const [key, val] of Object.entries(value)) {
      // `renames`/`children` are themselves prototype-free (see `sanitizeNode`),
      // so these lookups return `undefined` for non-own keys instead of an
      // inherited function — no spurious rename and no crash on recursion.
      const originalKey = mapping.renames[key] ?? key;
      const childMapping = mapping.children[key];
      restored[originalKey] = childMapping
        ? restoreOriginalKeys(val, childMapping, depth + 1)
        : val;
    }
    return restored;
  }

  return value;
}
