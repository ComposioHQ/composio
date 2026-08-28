/**
 * Property tests for `dereferenceJsonSchema`.
 *
 * The example-based suite in `jsonSchema.test.ts` pins specific shapes. These
 * tests pin *invariants* over a generated space of schemas, which is where the
 * gaps were: sentinel-mode cycles, external refs surviving, `$ref`-shaped data
 * sitting inside instance-value keywords, idempotence, and — the failure that
 * originally motivated the helper — output that cannot be serialized.
 *
 * The generator is a small seeded PRNG rather than a property-testing library.
 * Neither SDK has one today, and the Python counterpart
 * (`python/tests/test_json_schema_properties.py`) mirrors this file's generator
 * and invariants exactly; a library in one ecosystem and not the other would
 * break that symmetry. Swapping in fast-check/hypothesis later is mechanical —
 * the invariants below are the durable part.
 *
 * Failures are reproducible: every case prints its seed.
 *
 * Regenerated 2026-08-28 from the Python counterpart after the original was
 * lost in a session handoff.
 */
import { describe, it, expect } from 'vitest';
import { dereferenceJsonSchema } from '../../src/utils/jsonSchema';
import { JsonSchemaRefResolutionError } from '../../src/errors';

/** Deterministic PRNG so a failing case can be replayed from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Json = Record<string, unknown>;

/** Keywords whose values are instance data — a `$ref` there is not a reference. */
const INSTANCE_VALUE_KEYWORDS = new Set(['const', 'default', 'enum', 'examples']);

const CASES = 300;
const SEEDS = Array.from({ length: CASES }, (_, i) => 0x5eed + i * 7919);

interface GeneratedDoc {
  schema: Json;
  /** True when the document contains at least one ref that cannot resolve. */
  hasUnresolvable: boolean;
}

const pick = <T>(rng: () => number, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];

/**
 * Build a schema exercising every branch the dereferencer has: resolvable refs,
 * chains, self-recursion, dangling pointers, external refs, legacy
 * `definitions`, Draft 2020-12 siblings next to `$ref`, and `$ref`-shaped data
 * parked inside instance-value keywords.
 */
function generateDoc(rng: () => number, withInstanceValueRefs = false): GeneratedDoc {
  const chance = (p: number) => rng() < p;

  // Definition names include JSON-Pointer escapes (`~0`/`~1`) and prototype
  // keys; the clone step filters the latter (prototype pollution), so refs to
  // them degrade to sentinels — a documented divergence from Python, which has
  // no prototype to pollute.
  const defNames = ['Alpha', 'Beta', 'Gamma', 'a/b', 'c~d', '__proto__', 'constructor'].slice(
    0,
    1 + Math.floor(rng() * 7)
  );

  const escapePointer = (name: string) => name.replace(/~/g, '~0').replace(/\//g, '~1');

  const defsKey = chance(0.25) ? 'definitions' : '$defs';
  const pointerTo = (name: string) => `#/${defsKey}/${escapePointer(name)}`;

  const state = { hasUnresolvable: false };

  const leaf = (): Json => {
    const node: Json = { type: pick(rng, ['string', 'number', 'integer', 'boolean']) };
    // `$ref`-shaped *data*. Only injected for the dedicated test block, so the
    // other properties stay independent of the instance-value bug this module
    // documents.
    if (withInstanceValueRefs) {
      if (chance(0.4)) node.default = { $ref: '#/$defs/NotARealReference' };
      if (chance(0.4)) node.enum = [{ $ref: '#/$defs/AlsoNotOne' }];
    }
    return node;
  };

  const refNode = (): Json => {
    const kind = pick(rng, [
      'resolvable',
      'resolvable',
      'resolvable',
      'dangling',
      'external',
      'whole-document',
      'deep',
    ]);
    let node: Json;
    if (kind === 'whole-document') {
      // `#` resolves to the root, always an ancestor, so this must come back
      // as a cycle sentinel rather than diverging.
      node = { $ref: '#' };
    } else if (kind === 'deep') {
      // Pointers are generic JSON Pointers, not `$defs`-only.
      node = { $ref: `#/${defsKey}/${escapePointer(defNames[0])}/properties/value` };
    } else if (kind === 'external') {
      node = {
        $ref: pick(rng, ['https://example.com/s.json', 'file:///tmp/s.json', 'other.json#/A']),
      };
    } else if (kind === 'dangling') {
      state.hasUnresolvable = true;
      node = { $ref: pointerTo('MissingDefinition') };
    } else {
      node = { $ref: pointerTo(pick(rng, defNames)) };
    }
    if (chance(0.3)) node.description = 'sibling description';
    return node;
  };

  const subschema = (depth: number): Json => {
    if (depth <= 0) return leaf();
    const kind = pick(rng, ['object', 'array', 'ref', 'combinator', 'leaf']);
    if (kind === 'object') {
      const properties: Record<string, Json> = {};
      const count = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < count; i++) properties[`p${i}`] = subschema(depth - 1);
      const node: Json = { type: 'object', properties };
      // A `$defs` block below the root is not stripped — only the root.
      if (chance(0.2)) node.$defs = { Local: { type: 'string' } };
      if (chance(0.4)) node.required = Object.keys(properties).slice(0, 1);
      if (chance(0.3)) node.additionalProperties = subschema(depth - 1);
      return node;
    }
    if (kind === 'array') return { type: 'array', items: subschema(depth - 1) };
    if (kind === 'ref') return refNode();
    if (kind === 'combinator') {
      return { [pick(rng, ['anyOf', 'oneOf', 'allOf'])]: [subschema(depth - 1), leaf()] };
    }
    return leaf();
  };

  const defs: Record<string, Json> = {};
  for (const name of defNames) {
    const body: Json = { type: 'object', properties: { value: leaf() } };
    // Self-recursion and cross-definition chains: neither has a finite inlined
    // form, so the dereferencer must break them rather than diverge.
    if (chance(0.35)) body.properties = { ...body.properties, self: { $ref: pointerTo(name) } };
    if (chance(0.3)) {
      body.properties = { ...body.properties, other: { $ref: pointerTo(pick(rng, defNames)) } };
    }
    defs[name] = body;
  }

  const rootProperties: Record<string, Json> = {};
  const rootCount = 1 + Math.floor(rng() * 4);
  for (let i = 0; i < rootCount; i++) rootProperties[`f${i}`] = subschema(3);

  return {
    schema: {
      type: 'object',
      properties: rootProperties,
      required: Object.keys(rootProperties).slice(0, 2),
      [defsKey]: defs,
    },
    hasUnresolvable: state.hasUnresolvable,
  };
}

/** Yield every object reachable through *schema* positions only. */
function* walkSchemaPositions(value: unknown): Generator<Json> {
  if (Array.isArray(value)) {
    for (const item of value) yield* walkSchemaPositions(item);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const node = value as Json;
  yield node;
  for (const [key, child] of Object.entries(node)) {
    if (INSTANCE_VALUE_KEYWORDS.has(key)) continue;
    yield* walkSchemaPositions(child);
  }
}

const internalRefs = (value: unknown): string[] =>
  [...walkSchemaPositions(value)]
    .map(node => node.$ref)
    .filter((ref): ref is string => typeof ref === 'string' && ref.startsWith('#'));

const externalRefs = (value: unknown): string[] =>
  [...walkSchemaPositions(value)]
    .map(node => node.$ref)
    .filter((ref): ref is string => typeof ref === 'string' && !ref.startsWith('#'));

const instanceValues = (value: unknown): unknown[] => {
  const found: unknown[] = [];
  for (const node of walkSchemaPositions(value)) {
    for (const [key, child] of Object.entries(node)) {
      if (INSTANCE_VALUE_KEYWORDS.has(key)) found.push(child);
    }
  }
  return found;
};

function forEachDoc(check: (doc: GeneratedDoc) => void, withInstanceValueRefs = false): void {
  /** Run *check* over every generated document, reporting the failing seed. */
  for (const seed of SEEDS) {
    const doc = generateDoc(mulberry32(seed), withInstanceValueRefs);
    try {
      check(doc);
    } catch (error) {
      throw new Error(
        `property failed for seed ${seed}\nschema: ${JSON.stringify(doc.schema, null, 2)}\n\n${String(error)}`
      );
    }
  }
}

describe('dereferenceJsonSchema — sentinel-mode properties', () => {
  it('never raises', () => {
    forEachDoc(doc => {
      dereferenceJsonSchema(doc.schema, { onUnresolved: 'sentinel' });
    });
  });

  it('leaves no internal ref', () => {
    forEachDoc(doc => {
      const out = dereferenceJsonSchema(doc.schema, { onUnresolved: 'sentinel' });
      expect(internalRefs(out)).toEqual([]);
    });
  });

  it('strips root definition blocks', () => {
    forEachDoc(doc => {
      const out = dereferenceJsonSchema(doc.schema, { onUnresolved: 'sentinel' }) as Json;
      expect('$defs' in out).toBe(false);
      expect('definitions' in out).toBe(false);
    });
  });

  it('preserves external refs', () => {
    forEachDoc(doc => {
      const before = new Set(externalRefs(doc.schema));
      const out = dereferenceJsonSchema(doc.schema, { onUnresolved: 'sentinel' });
      // Counts may grow (a def inlined at N sites carries its refs along),
      // but nothing reachable in the source may disappear.
      const after = new Set(externalRefs(out));
      for (const ref of before)
        expect(after.has(ref), `external ref disappeared: ${ref}`).toBe(true);
    });
  });

  it('never mutates its input', () => {
    forEachDoc(doc => {
      const snapshot = structuredClone(doc.schema);
      dereferenceJsonSchema(doc.schema, { onUnresolved: 'sentinel' });
      expect(doc.schema).toEqual(snapshot);
    });
  });

  it('returns serializable output', () => {
    // The failure this helper exists to prevent: a dereferencer that keeps
    // object identity on a recursive schema builds a real cycle, and
    // serializing it for the vendor raises.
    forEachDoc(doc => {
      JSON.stringify(dereferenceJsonSchema(doc.schema, { onUnresolved: 'sentinel' }));
    });
  });

  it('keeps definition blocks that are not at the root', () => {
    forEachDoc(doc => {
      // Only the root block is stripped. If a nested one was generated it
      // survives — the docs claim this and nothing else pins it.
      const input = JSON.stringify(doc.schema);
      if (!input.includes('"Local"')) return;
      const out = JSON.stringify(dereferenceJsonSchema(doc.schema, { onUnresolved: 'sentinel' }));
      expect(out.includes('"Local"')).toBe(true);
    });
  });

  it('does not blow up output size without bound', () => {
    // Inlining is depth-bounded but breadth-unbounded: a def referenced N
    // times is inlined N times. This does not assert a cap exists — it pins
    // the growth factor for the shapes we generate, so a change that makes
    // expansion dramatically worse is visible rather than silent.
    forEachDoc(doc => {
      const before = JSON.stringify(doc.schema).length;
      const after = JSON.stringify(
        dereferenceJsonSchema(doc.schema, { onUnresolved: 'sentinel' })
      ).length;
      expect(after).toBeLessThan(before * 50);
    });
  });

  it('is idempotent', () => {
    forEachDoc(doc => {
      const once = dereferenceJsonSchema(doc.schema, { onUnresolved: 'sentinel' });
      const twice = dereferenceJsonSchema(once, { onUnresolved: 'sentinel' });
      expect(twice).toEqual(once);
    });
  });
});

/** Number of unresolvable refs sentinel mode had to replace. */
function countReplacements(schema: Json): number {
  let replacements = 0;
  dereferenceJsonSchema(schema, {
    onUnresolved: 'sentinel',
    onReplace: () => {
      replacements += 1;
    },
  });
  return replacements;
}

describe('dereferenceJsonSchema — throw-mode properties', () => {
  it('agrees with sentinel mode when everything resolves', () => {
    forEachDoc(doc => {
      if (countReplacements(doc.schema) > 0) return;
      const strict = dereferenceJsonSchema(doc.schema);
      const lenient = dereferenceJsonSchema(doc.schema, { onUnresolved: 'sentinel' });
      expect(strict).toEqual(lenient);
    });
  });

  it('raises exactly when sentinel mode replaced something', () => {
    forEachDoc(doc => {
      if (countReplacements(doc.schema) > 0) {
        expect(() => dereferenceJsonSchema(doc.schema)).toThrow(JsonSchemaRefResolutionError);
      } else {
        dereferenceJsonSchema(doc.schema);
      }
    });
  });
});

describe('dereferenceJsonSchema — instance-value keywords', () => {
  // KNOWN BROKEN — ratchets, do not delete.
  //
  // `const`, `default`, `enum` and `examples` hold *instance data*, not
  // subschemas, so a `{"$ref": ...}` inside one is an ordinary object that
  // happens to have a `$ref` key — not a reference to resolve.
  //
  // `dereferenceJsonSchema` walks containers with no keyword check, so a tool
  // whose schema carries `default: {"$ref": ...}` has that *value* rewritten
  // into the unresolved sentinel. `INSTANCE_VALUE_KEYWORDS` exists
  // (`jsonSchema.ts:36`) and is honored by `deduplicateJsonSchemaRequiredArrays`
  // and `toStrictJsonSchema`, but not by the dereferencer. The Python port has
  // the identical gap (`python/tests/test_json_schema_properties.py`).
  //
  // `it.fails` means these pass the suite while the bug exists; once the
  // dereferencer stops walking instance-value keywords they start failing with
  // "expected to fail but passed", forcing the marker's removal. A fix cannot
  // land silently.
  it.fails('does not rewrite $ref-shaped data', () => {
    forEachDoc(doc => {
      const out = dereferenceJsonSchema(doc.schema, { onUnresolved: 'sentinel' });
      for (const value of instanceValues(out)) {
        expect(JSON.stringify(value)).not.toContain('Schema shape unresolved at the source');
      }
    }, true);
  });

  it.fails('does not raise on $ref-shaped data', () => {
    forEachDoc(doc => {
      // Every pointer under the definitions block resolves; the only
      // unresolvable strings live in `default`/`enum`, which are data.
      if (doc.hasUnresolvable) return;
      dereferenceJsonSchema(doc.schema);
    }, true);
  });
});
