/**
 * Regenerates strict-cases.json (both language copies) from the case inputs
 * below, using the built @composio/core. Run from the repository root after
 * `pnpm --filter @composio/core build`:
 *
 *   node ts/packages/core/test/fixtures/json-schema-conversion/generate-strict-cases.mjs
 *
 * The JSON is the pinned contract; this script only derives it so both SDK
 * test suites assert against identical expectations. Format the TypeScript
 * copy with prettier before copying (the pre-commit hook would otherwise
 * make the copies differ).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../../..');
const { toStrictJsonSchema, omitNullToolArguments } = await import(
  path.join(repoRoot, 'ts/packages/core/dist/index.mjs')
);
const obj = (properties, required, extra = {}) => ({
  type: 'object',
  properties,
  ...(required ? { required } : {}),
  ...extra,
});
const cases = [
  [
    'flat-all-required-unchanged',
    'An already-strict schema is returned unchanged with no changes.',
    obj({ query: { type: 'string' } }, ['query'], { additionalProperties: false }),
  ],
  [
    'nested-optional-property-widened',
    'Optional properties stay, become required and accept null at every depth.',
    obj(
      {
        cfg: obj(
          { url: { type: 'string' }, note: { type: 'string', description: 'optional note' } },
          ['url']
        ),
      },
      ['cfg']
    ),
  ],
  [
    'no-required-array-widens-every-property',
    'An object without `required` requires and widens every property.',
    obj({ a: { type: 'string' }, b: { type: 'number' } }),
  ],
  [
    'required-empty-array-widens-every-property',
    'An empty `required` array is the same as an absent one.',
    obj({ a: { type: 'string' } }, []),
  ],
  [
    'nullable-type-array-kept',
    'A `type` array with null is accepted by the API and left alone.',
    obj({ id: { type: ['string', 'null'], description: 'identifier' } }, ['id']),
  ],
  [
    'nullable-object-stays-nullable',
    'A nullable object keeps its type array; only its own properties are closed.',
    obj(
      { cfg: { type: ['object', 'null'], properties: { a: { type: 'string' } }, required: ['a'] } },
      ['cfg']
    ),
  ],
  [
    'nullable-array-kept',
    'A nullable array keeps its type array and items.',
    obj({ xs: { type: ['array', 'null'], items: { type: 'string' } } }, ['xs']),
  ],
  [
    'optional-any-of-gets-null-branch',
    'An optional composition gains a null branch instead of a sibling type.',
    obj({ value: { anyOf: [{ type: 'string' }, { type: 'number' }] } }),
  ],
  [
    'any-of-already-nullable-unchanged',
    'A composition that already accepts null is not widened twice.',
    obj({ value: { anyOf: [{ type: 'string' }, { type: 'null' }] } }),
  ],
  [
    'optional-enum-only-wrapped',
    'An enum-only property is wrapped so the annotation stays outside the anyOf.',
    obj({ choice: { enum: ['a', 'b'], description: 'pick one', title: 'Choice' } }),
  ],
  [
    'optional-const-wrapped',
    'A const-only property is wrapped in an anyOf with a null branch.',
    obj({ kind: { const: 'fixed' } }),
  ],
  [
    'optional-empty-schema-unchanged',
    'An empty schema already accepts null and is left alone.',
    obj({ anything: {} }),
  ],
  [
    'multi-type-array-gains-null',
    'A multi-type array gains null instead of being converted to anyOf.',
    obj({ value: { type: ['string', 'number'] } }),
  ],
  [
    'one-of-converted-to-any-of',
    'oneOf is unsupported and becomes anyOf.',
    obj({ either: { oneOf: [{ type: 'string' }, { type: 'number' }] } }, ['either']),
  ],
  [
    'array-items-object-normalized',
    'Objects inside array items are closed and widened.',
    obj(
      {
        rows: {
          type: 'array',
          items: obj({ id: { type: 'string' }, tag: { type: 'string' } }, ['id']),
        },
      },
      ['rows']
    ),
  ],
  [
    'default-and-examples-stripped',
    'Annotation keywords the API rejects are stripped and reported.',
    obj({ name: { type: 'string', examples: ['a'], default: 'x' } }, ['name']),
  ],
  [
    'enum-values-are-data-not-keywords',
    'Keys inside enum/const values are data and must not be treated as keywords.',
    obj({ opts: { enum: [{ default: 1, properties: {} }, null] } }, ['opts']),
  ],
  [
    'property-names-are-not-keywords',
    'Properties named like keywords are ordinary properties.',
    obj({
      default: { type: 'string' },
      $ref: { type: 'string' },
      type: { type: 'string' },
      properties: obj({ x: { type: 'string' } }),
    }),
  ],
  [
    'prototype-key-property-name',
    'A property named __proto__ or constructor is handled as a plain name.',
    JSON.parse(
      '{"type":"object","properties":{"__proto__":{"type":"string"},"constructor":{"type":"number"}}}'
    ),
  ],
  [
    'schema-valued-additional-properties-unsupported',
    'A map-style object cannot be expressed and is reported, not closed.',
    obj({ headers: { type: 'object', additionalProperties: { type: 'string' } } }, ['headers']),
  ],
  [
    'additional-properties-true-unsupported',
    'An explicitly open object is reported.',
    obj({ open: { type: 'object', additionalProperties: true } }, ['open']),
  ],
  [
    'additional-properties-empty-schema-unsupported',
    'An empty-schema additionalProperties accepts anything and is reported.',
    obj({ open: { type: 'object', additionalProperties: {} } }, ['open']),
  ],
  [
    'free-form-object-unsupported',
    'A property-less object accepts arbitrary keys and is reported.',
    obj({ meta: { type: 'object', description: 'any json' } }, ['meta']),
  ],
  [
    'pattern-properties-unsupported',
    'patternProperties cannot be expressed and is reported.',
    obj({ tagged: { type: 'object', patternProperties: { '^x-': { type: 'string' } } } }, [
      'tagged',
    ]),
  ],
  [
    'empty-closed-object-representable',
    'An object closed with no properties is representable.',
    obj({ empty: { type: 'object', additionalProperties: false } }, ['empty']),
  ],
  [
    'all-of-unsupported',
    'allOf has no lossless rewrite and is reported.',
    obj({ all: { allOf: [{ type: 'string' }] } }, ['all']),
  ],
  [
    'prefix-items-unsupported',
    'prefixItems has no lossless rewrite and is reported.',
    obj({ pair: { type: 'array', prefixItems: [{ type: 'number' }] } }, ['pair']),
  ],
  [
    'defs-ref-kept-and-definition-normalized',
    'Local $refs are kept and the definition is normalized where it is declared.',
    obj({ cfg: { $ref: '#/$defs/Config' } }, ['cfg'], {
      $defs: { Config: obj({ url: { type: 'string' }, note: { type: 'string' } }, ['url']) },
    }),
  ],
  [
    'optional-ref-widened-with-null-branch',
    'An optional $ref property is widened with an anyOf null branch.',
    obj({ cfg: { $ref: '#/$defs/Config', description: 'optional' } }, undefined, {
      $defs: { Config: obj({ url: { type: 'string' } }, ['url']) },
    }),
  ],
  [
    'recursive-defs-kept',
    'Self-recursive definitions are representable.',
    obj({ node: { $ref: '#/$defs/Node' } }, ['node'], {
      $defs: {
        Node: obj({ child: { $ref: '#/$defs/Node' }, label: { type: 'string' } }, ['label']),
      },
    }),
  ],
  [
    'mutually-recursive-defs-kept',
    'Mutually recursive definitions are representable.',
    obj({ a: { $ref: '#/$defs/A' } }, ['a'], {
      $defs: { A: obj({ b: { $ref: '#/$defs/B' } }), B: obj({ a: { $ref: '#/$defs/A' } }) },
    }),
  ],
  [
    'legacy-definitions-ref-kept',
    'Legacy definitions are supported like $defs.',
    obj({ cfg: { $ref: '#/definitions/Config' } }, ['cfg'], {
      definitions: { Config: obj({ url: { type: 'string' } }) },
    }),
  ],
  [
    'ref-into-properties-kept',
    'A local $ref outside $defs resolves and is kept.',
    obj({ a: obj({ x: { type: 'string' } }, ['x']), b: { $ref: '#/properties/a' } }, ['a', 'b']),
  ],
  [
    'root-ref-kept',
    'A local $ref to the document root resolves and is kept.',
    obj({ child: { $ref: '#' }, label: { type: 'string' } }, ['label']),
  ],
  [
    'dangling-ref-unsupported',
    'A $ref without a target is reported at its own path.',
    obj({ cfg: { $ref: '#/$defs/Nope' } }, ['cfg']),
  ],
  [
    'external-ref-unsupported',
    'A $ref outside the document is reported.',
    obj({ cfg: { $ref: 'https://example.com/schema.json' } }, ['cfg']),
  ],
  [
    'duplicate-required-deduped',
    'Duplicate required entries are removed.',
    obj({ a: { type: 'string' } }, ['a', 'a']),
  ],
  [
    'required-unknown-names-dropped',
    'Required names without a property are dropped from required.',
    obj({ a: { type: 'string' } }, ['a', 'ghost']),
  ],
  [
    'required-not-an-array-ignored',
    'A malformed required is treated as absent.',
    obj({ a: { type: 'string' } }, 'a'),
  ],
  [
    'description-kept-on-widened-node',
    'Annotations survive widening.',
    obj({ a: { type: 'integer', description: 'count', title: 'Count', minimum: 0 } }),
  ],
  ['non-object-root-unsupported', 'The root must be an object.', { type: 'string' }],
  [
    'nullable-root-unsupported',
    'The root must not be nullable.',
    { type: ['object', 'null'], properties: { a: { type: 'string' } } },
  ],
  [
    'properties-without-type-become-object',
    'A node with properties but no type is treated as an object.',
    obj({ cfg: { properties: { a: { type: 'string' } } } }, ['cfg']),
  ],
  [
    'root-without-type-become-object',
    'A root with properties but no type is treated as an object.',
    { properties: { a: { type: 'string' } } },
  ],
  // Edge cases enumerated independently with a second model.
  [
    'root-single-element-type-array-accepted',
    'A root typed ["object"] is an object root.',
    { type: ['object'], properties: { a: { type: 'string' } }, required: ['a'] },
  ],
  [
    'three-member-type-array-gains-null',
    'A three-member type array gains null once.',
    obj({ v: { type: ['string', 'number', 'boolean'] } }),
  ],
  [
    'optional-null-only-property-unchanged',
    'A property typed null already accepts null.',
    obj({ nothing: { type: 'null' } }),
  ],
  [
    'optional-enum-with-null-not-rewrapped',
    'An enum that already lists null is not wrapped again.',
    obj({ choice: { enum: ['a', null] } }),
  ],
  [
    'optional-const-null-not-rewrapped',
    'A const null already accepts null.',
    obj({ nothing: { const: null } }),
  ],
  [
    'nested-any-of-branch-widened',
    'Optional properties inside anyOf branches are widened.',
    obj({ v: { anyOf: [obj({ a: { type: 'string' } }), { type: 'string' }] } }, ['v']),
  ],
  [
    'array-of-nullable-objects-closed',
    'Nullable objects inside array items are closed and stay nullable.',
    obj(
      {
        rows: {
          type: 'array',
          items: { type: ['object', 'null'], properties: { id: { type: 'string' } } },
        },
      },
      ['rows']
    ),
  ],
  [
    'tuple-form-items-unsupported',
    'Draft-4 tuple items have no strict-mode equivalent.',
    obj({ pair: { type: 'array', items: [{ type: 'number' }, { type: 'string' }] } }, ['pair']),
  ],
  [
    'boolean-items-unsupported',
    'A boolean items subschema is reported.',
    obj({ xs: { type: 'array', items: true } }, ['xs']),
  ],
  [
    'not-keyword-unsupported',
    'not has no strict-mode equivalent.',
    obj({ v: { not: { type: 'string' } } }, ['v']),
  ],
  [
    'if-then-else-unsupported',
    'Conditional keywords have no strict-mode equivalent.',
    obj(
      { v: { type: 'string', if: { minLength: 1 }, then: { maxLength: 5 }, else: { const: '' } } },
      ['v']
    ),
  ],
  [
    'dependent-schemas-unsupported',
    'dependentSchemas has no strict-mode equivalent.',
    obj({ a: { type: 'string' } }, ['a'], {
      dependentSchemas: { a: obj({ b: { type: 'string' } }) },
    }),
  ],
  [
    'property-names-keyword-unsupported',
    'propertyNames has no strict-mode equivalent.',
    obj({ a: { type: 'string' } }, ['a'], { propertyNames: { pattern: '^a' } }),
  ],
  [
    'one-of-beside-any-of-unsupported',
    'oneOf next to anyOf cannot be merged and is reported.',
    obj({ v: { anyOf: [{ type: 'string' }], oneOf: [{ type: 'number' }] } }, ['v']),
  ],
  [
    'boolean-property-subschema-unsupported',
    'A boolean property subschema is reported.',
    obj({ anything: true, nothing: false }, ['anything', 'nothing']),
  ],
  [
    'properties-not-an-object-unsupported',
    'A malformed properties value is reported instead of emptied.',
    obj('not-a-map', ['a']),
  ],
  [
    'ref-with-siblings-kept',
    'Sibling keywords next to a $ref are kept.',
    obj({ cfg: { $ref: '#/$defs/Config', description: 'cfg', title: 'Config' } }, ['cfg'], {
      $defs: { Config: obj({ a: { type: 'string' } }, ['a']) },
    }),
  ],
  [
    'required-non-string-entries-ignored',
    'Non-string required entries are ignored.',
    obj({ a: { type: 'string' }, b: { type: 'string' } }, ['a', 1, null]),
  ],
  [
    'dynamic-keys-reported-once-with-pattern-properties',
    'additionalProperties and patternProperties on one node report additionalProperties.',
    obj(
      {
        m: {
          type: 'object',
          additionalProperties: { type: 'string' },
          patternProperties: { '^x': { type: 'string' } },
        },
      },
      ['m']
    ),
  ],
  [
    'empty-properties-open-object-unsupported',
    'An object with empty properties and no closing is free-form.',
    obj({ m: { type: 'object', properties: {} } }, ['m']),
  ],
  [
    'default-stripped-then-widened',
    'Stripping default and widening compose.',
    obj({ a: { type: 'string', default: 'x' } }),
  ],
  [
    'nested-any-of-in-any-of-kept',
    'A composition nested inside a composition is normalized branch by branch.',
    obj(
      {
        v: {
          anyOf: [
            { anyOf: [obj({ a: { type: 'string' } }), { type: 'number' }] },
            { type: 'string' },
          ],
        },
      },
      ['v']
    ),
  ],
  [
    'definitions-and-defs-both-normalized',
    'Legacy definitions and $defs coexist and both are normalized.',
    obj({ a: { $ref: '#/$defs/A' }, b: { $ref: '#/definitions/B' } }, ['a', 'b'], {
      $defs: { A: obj({ x: { type: 'string' } }) },
      definitions: { B: obj({ y: { type: 'string' } }) },
    }),
  ],
  [
    'deep-nesting-normalized-fully',
    'Ten levels of nested objects are normalized at every level.',
    (() => {
      let node = { type: 'object', properties: { leaf: { type: 'string' } } };
      for (let i = 0; i < 10; i++)
        node = { type: 'object', properties: { child: node }, required: ['child'] };
      return node;
    })(),
  ],
  [
    'chained-refs-resolved',
    'A $ref to a $ref resolves to the final definition.',
    obj({ a: { $ref: '#/$defs/Alias' } }, ['a'], {
      $defs: { Alias: { $ref: '#/$defs/Real' }, Real: obj({ x: { type: 'string' } }, ['x']) },
    }),
  ],
];
const argumentCases = {
  'nested-optional-property-widened': [
    { input: { cfg: { url: 'u', note: null } }, output: { cfg: { url: 'u' } } },
  ],
  'nullable-type-array-kept': [{ input: { id: null }, output: { id: null } }],
  'nullable-object-stays-nullable': [
    { input: { cfg: null }, output: { cfg: null } },
    { input: { cfg: { a: 'x' } }, output: { cfg: { a: 'x' } } },
  ],
  'any-of-already-nullable-unchanged': [{ input: { value: null }, output: { value: null } }],
  'optional-enum-only-wrapped': [{ input: { choice: null }, output: {} }],
  'array-items-object-normalized': [
    { input: { rows: [{ id: '1', tag: null }, null] }, output: { rows: [{ id: '1' }, null] } },
  ],
  'enum-values-are-data-not-keywords': [{ input: { opts: null }, output: { opts: null } }],
  'property-names-are-not-keywords': [
    {
      input: { default: null, $ref: 'x', type: null, properties: { x: null } },
      output: { $ref: 'x', properties: {} },
    },
  ],
  'defs-ref-kept-and-definition-normalized': [
    { input: { cfg: { url: 'u', note: null } }, output: { cfg: { url: 'u' } } },
  ],
  'optional-ref-widened-with-null-branch': [{ input: { cfg: null }, output: {} }],
  'recursive-defs-kept': [
    {
      input: { node: { label: 'a', child: { label: 'b', child: null } } },
      output: { node: { label: 'a', child: { label: 'b' } } },
    },
  ],
  'no-required-array-widens-every-property': [
    { input: { a: null, b: 1, unknown: null }, output: { b: 1, unknown: null } },
  ],
  'optional-null-only-property-unchanged': [
    { input: { nothing: null }, output: { nothing: null } },
  ],
  'optional-enum-with-null-not-rewrapped': [{ input: { choice: null }, output: { choice: null } }],
  'optional-const-null-not-rewrapped': [{ input: { nothing: null }, output: { nothing: null } }],
  'array-of-nullable-objects-closed': [
    { input: { rows: [null, { id: null }] }, output: { rows: [null, {}] } },
  ],
  'nested-any-of-branch-widened': [
    { input: { v: { a: null } }, output: { v: {} } },
    { input: { v: null }, output: {} },
  ],
  'nested-any-of-in-any-of-kept': [{ input: { v: { a: null } }, output: { v: {} } }],
  'chained-refs-resolved': [
    { input: { a: { x: null } }, output: { a: {} } },
    { input: { a: null }, output: {} },
  ],
  'nullable-array-kept': [
    { input: { xs: null }, output: { xs: null } },
    { input: { xs: [null] }, output: { xs: [null] } },
  ],
  'nested-optional-property-widened': [
    { input: { cfg: { url: 'u', note: null } }, output: { cfg: { url: 'u' } } },
    { input: { cfg: null }, output: {} },
    { input: { cfg: { url: 'u', extra: null } }, output: { cfg: { url: 'u', extra: null } } },
  ],
};
const out = { cases: [] };
for (const [id, description, schema] of cases) {
  const snapshot = JSON.stringify(schema);
  const r = toStrictJsonSchema(schema);
  if (JSON.stringify(schema) !== snapshot) throw new Error(`mutated: ${id}`);
  const entry = { id, description, schema };
  if (r.unsupported.length)
    entry.strict = { unsupported: r.unsupported.map(u => ({ path: u.path, keyword: u.keyword })) };
  else {
    const again = toStrictJsonSchema(r.schema);
    if (JSON.stringify(again.schema) !== JSON.stringify(r.schema) || again.changes.length)
      throw new Error(`not idempotent: ${id}`);
    entry.strict = { schema: r.schema };
  }
  if (r.changes.length) entry.changes = r.changes.map(c => ({ path: c.path, reason: c.reason }));
  if (argumentCases[id]) {
    entry.arguments = argumentCases[id].map(({ input, output }) => {
      const actual = omitNullToolArguments(input, r.source);
      if (JSON.stringify(actual) !== JSON.stringify(output))
        throw new Error(
          `arguments mismatch ${id}: ${JSON.stringify(actual)} vs ${JSON.stringify(output)}`
        );
      return { input, output };
    });
  }
  out.cases.push(entry);
}
const json = JSON.stringify(out, null, 2) + '\n';
fs.writeFileSync(path.join(here, 'strict-cases.json'), json);
fs.writeFileSync(
  path.join(repoRoot, 'python/tests/fixtures/json-schema-conversion/strict-cases.json'),
  json
);
for (const c of out.cases)
  console.log(
    c.id.padEnd(50),
    c.strict.unsupported
      ? 'UNSUPPORTED ' + JSON.stringify(c.strict.unsupported)
      : 'ok' + (c.changes ? ' changes=' + c.changes.map(x => x.reason.split('-')[0]).join(',') : '')
  );
