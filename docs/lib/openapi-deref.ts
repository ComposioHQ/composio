/**
 * Inlines local Reference Objects for consumers that read schema fields
 * directly.
 *
 * Caching each pointer's output object before populating it preserves object
 * identity for recursive schemas and prevents reference resolution itself from
 * recursing forever.
 */
export function dereferenceDocument<T>(spec: T): T {
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

  return walk(spec) as T;
}
