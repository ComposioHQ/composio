// Fumadocs keeps local `$ref`s in bundled OpenAPI documents and resolves them
// lazily in its UI. This module creates the concrete schema tree needed by
// server-side renderers that read fields directly.

const dereferencedDocuments = new WeakMap<object, object>();

/**
 * Returns a non-mutating copy of `spec` with local JSON Pointers inlined.
 *
 * External references remain unchanged. Cached output objects preserve
 * identity for recursive schemas and let alias chains terminate safely.
 * Repeated calls with the same immutable input object reuse that copy.
 */
export function dereferenceDocument<T extends object>(spec: T): T {
  const cachedDocument = dereferencedDocuments.get(spec);
  if (cachedDocument) return cachedDocument as T;

  const cache = new Map<string, unknown>();

  function resolvePointer(ref: string): unknown {
    // JSON Pointer per RFC 6901: '~1' encodes '/', '~0' encodes '~'.
    const parts = ref
      .slice(2)
      .split('/')
      .map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));

    let current: unknown = spec;
    for (const part of parts) {
      if (current === null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  function resolveRef(ref: string): unknown {
    if (cache.has(ref)) return cache.get(ref);

    const target = resolvePointer(ref);
    if (target === null || typeof target !== 'object') {
      cache.set(ref, target);
      return target;
    }

    // Seed the cache before walking so self-referential schemas terminate.
    const out: Record<string, unknown> | unknown[] = Array.isArray(target) ? [] : {};
    cache.set(ref, out);

    if (Array.isArray(target)) {
      for (const item of target) (out as unknown[]).push(walk(item));
      return out;
    }

    const entries = Object.entries(target as Record<string, unknown>);
    const aliased = (target as Record<string, unknown>).$ref;

    // A component can itself be a Reference Object (an alias chain such as
    // `Alias: { $ref: Real }`). Walking its entries alone would copy the `$ref`
    // string through untouched, so follow it and fold the target's fields in
    // first; sibling keywords below then override them. A cyclic alias chain
    // terminates here because the seeded cache entry is returned as-is.
    if (typeof aliased === 'string' && aliased.startsWith('#/')) {
      const resolved = resolveRef(aliased);
      if (resolved !== null && typeof resolved === 'object' && !Array.isArray(resolved)) {
        Object.assign(out as Record<string, unknown>, resolved);
      }
    }

    for (const [key, value] of entries) {
      if (key === '$ref' && typeof aliased === 'string' && aliased.startsWith('#/')) continue;
      (out as Record<string, unknown>)[key] = walk(value);
    }
    return out;
  }

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;

    const obj = node as Record<string, unknown>;
    const ref = obj.$ref;

    if (typeof ref === 'string') {
      // Leave external references alone - nothing local can resolve them.
      if (!ref.startsWith('#/')) return node;

      const resolved = resolveRef(ref);
      const siblings = Object.entries(obj).filter(([key]) => key !== '$ref');
      if (siblings.length === 0) return resolved;
      if (resolved === null || typeof resolved !== 'object') return node;

      // Sibling keywords (description, deprecated, ...) override the target.
      // Spread into a fresh object so the shared cached value is never mutated.
      const merged: Record<string, unknown> = { ...(resolved as Record<string, unknown>) };
      for (const [key, value] of siblings) merged[key] = walk(value);
      return merged;
    }

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) out[key] = walk(value);
    return out;
  }

  const dereferenced = walk(spec) as T;
  dereferencedDocuments.set(spec, dereferenced);
  return dereferenced;
}
