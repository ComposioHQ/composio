import { jsonSchemaToZod } from '@composio/json-schema-to-zod';
import { Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { jsonSchemaToEffectSchema, type JsonSchemaValidationIssue } from '../src/index';
import { acceptedFor, loadObjectCases } from './fixtures/corpus';

type JsonSchema = Record<string, unknown>;

const effectAccepts = (schema: JsonSchema, input: unknown): boolean =>
  Option.isSome(
    Schema.decodeUnknownOption(jsonSchemaToEffectSchema(schema), { errors: 'all' })(input)
  );

const zodAccepts = (schema: JsonSchema, input: unknown): boolean =>
  jsonSchemaToZod(schema).safeParse(input).success;

const expectParity = (schema: JsonSchema, input: unknown, expected: boolean): void => {
  expect(effectAccepts(schema, input)).toBe(expected);
  expect(zodAccepts(schema, input)).toBe(expected);
};

describe('jsonSchemaToEffectSchema', () => {
  it('matches the previous validator for object, required, and additional-property checks', () => {
    const strictSchema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        metadata: {
          type: 'object',
          properties: { count: { type: 'integer' } },
        },
      },
    } satisfies JsonSchema;

    expectParity(strictSchema, { name: 'Ada', metadata: { count: 1 } }, true);
    expectParity(strictSchema, { name: 'Ada', extra: true }, false);
    expectParity(strictSchema, { name: 'Ada', metadata: { count: 1.5 } }, false);
    expectParity(strictSchema, { metadata: { count: 1 } }, false);

    expectParity({ type: 'object', additionalProperties: true }, { arbitrary: 'value' }, true);
  });

  it('normalizes the OpenAPI and Composio extensions accepted by the previous validator', () => {
    expectParity({ type: 'string', nullable: true }, null, true);
    expectParity({ type: 'string', nullable: true }, 42, false);
    expectParity({ type: 'string', min: 2, max: 4 }, 'abc', true);
    expectParity({ type: 'string', min: 2, max: 4 }, 'a', false);
    expectParity({ type: 'array', min: 1, max: 2, items: { type: 'number' } }, [1], true);
    expectParity({ type: 'array', min: 1, max: 2, items: { type: 'number' } }, [], false);
    expectParity({ type: 'number', format: 'int64' }, 42, true);
    expectParity({ type: 'number', format: 'int64' }, 4.2, false);
    expectParity({ type: 'string', format: 'binary' }, 'aGVsbG8=', true);
    expectParity({ type: 'string', format: 'binary' }, 'not base64', false);
    expectParity({ type: 'string', format: 'ip' }, '127.0.0.1', true);
    expectParity({ type: 'string', format: 'ip' }, 'not-an-ip', false);
  });

  it('supports JSON Schema composition without generated code', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['value'],
      properties: {
        value: {
          anyOf: [
            { type: 'string', minLength: 1 },
            { type: 'integer', minimum: 1 },
          ],
        },
      },
    } satisfies JsonSchema;

    expect(effectAccepts(schema, { value: 'ready' })).toBe(true);
    expect(effectAccepts(schema, { value: 2 })).toBe(true);
    expect(effectAccepts(schema, { value: 0 })).toBe(false);
    expect(effectAccepts(schema, { value: false })).toBe(false);
  });

  it('reports all failures with field paths and groups unknown keys', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['email', 'profile'],
      properties: {
        email: { type: 'string' },
        profile: {
          type: 'object',
          additionalProperties: false,
          required: ['age'],
          properties: { age: { type: 'integer' } },
        },
      },
    } satisfies JsonSchema;
    let captured: ReadonlyArray<JsonSchemaValidationIssue> = [];
    const effectSchema = jsonSchemaToEffectSchema(schema, {
      formatIssues: issues => {
        captured = issues;
        return issues.map(issue => issue.message);
      },
    });

    const result = Schema.decodeUnknownOption(effectSchema, { errors: 'all' })({
      email: 42,
      profile: { age: 'old', extra: true },
      typo: true,
    });

    expect(Option.isNone(result)).toBe(true);
    expect(captured).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'type', path: ['email'] }),
        expect.objectContaining({ code: 'type', path: ['profile', 'age'] }),
        expect.objectContaining({ code: 'unrecognized_keys', keys: ['extra'], path: ['profile'] }),
        expect.objectContaining({ code: 'unrecognized_keys', keys: ['typo'], path: [] }),
      ])
    );
  });
});

describe('shared cross-SDK object corpus', () => {
  for (const testCase of loadObjectCases()) {
    describe(testCase.id, () => {
      for (const [index, instance] of testCase.instances.entries()) {
        const expected = acceptedFor(instance, 'effect');

        it(`instance ${index} is ${expected ? 'accepted' : 'rejected'}`, () => {
          const result = Schema.decodeUnknownOption(
            jsonSchemaToEffectSchema(testCase.schema as JsonSchema),
            { errors: 'all' }
          )(instance.input);

          expect(Option.isSome(result)).toBe(expected);
          if (Option.isSome(result) && instance.effect && 'output' in instance.effect) {
            // Effect decoding is validation-only: a successful decode returns the
            // input value unchanged, with no default materialization.
            expect(result.value).toEqual(instance.effect.output);
          }
        });
      }
    });
  }
});

describe('schema defects fail at construction', () => {
  // `@cfworker/json-schema` resolves references and compiles regexes inside
  // `validate`, so each of these used to reach the caller once per call, as an
  // input validation failure. The consumer wraps construction in its own
  // `Effect.try` and reports a compile failure against the cached schema path,
  // which is the accurate diagnosis for all of them.
  const defects: ReadonlyArray<readonly [string, JsonSchema, RegExp]> = [
    [
      'an invalid patternProperties regular expression',
      { type: 'object', patternProperties: { '[': { type: 'string' } } },
      /Invalid patternProperties regular expression/,
    ],
    [
      'an invalid patternProperties regular expression nested under a property',
      {
        type: 'object',
        properties: { a: { type: 'object', patternProperties: { '(': { type: 'string' } } } },
      },
      /Invalid patternProperties regular expression/,
    ],
    [
      'an invalid patternProperties regular expression inside array items',
      {
        type: 'object',
        properties: {
          a: { type: 'array', items: { type: 'object', patternProperties: { '(?<': {} } } },
        },
      },
      /Invalid patternProperties regular expression/,
    ],
    [
      'an unresolved local $ref in a patternProperties subschema',
      { type: 'object', patternProperties: { '^s_': { $ref: '#/$defs/Missing' } } },
      /Unresolved \$ref .* in a dynamic-key schema/,
    ],
    [
      'an external $ref in a patternProperties subschema',
      { type: 'object', patternProperties: { '^s_': { $ref: 'https://example.com/s.json' } } },
      /Unresolved \$ref .* in a dynamic-key schema/,
    ],
    [
      'an unresolved local $ref in a schema-valued additionalProperties',
      { type: 'object', additionalProperties: { $ref: '#/$defs/Missing' } },
      /Unresolved \$ref .* in a dynamic-key schema/,
    ],
    [
      'a dynamic-key reference whose target carries a dangling reference',
      {
        type: 'object',
        additionalProperties: { $ref: '#/$defs/Hop' },
        $defs: { Hop: { type: 'object', properties: { a: { $ref: '#/$defs/Missing' } } } },
      },
      /Unresolved \$ref .* in a dynamic-key schema/,
    ],
    [
      'a duplicate schema URI',
      {
        $id: 'https://example.com/a',
        type: 'object',
        $defs: { x: { $id: 'https://example.com/a', type: 'string' } },
      },
      /Duplicate schema URI/,
    ],
  ];

  // Deliberately outside the scope above: matching the Python SDK, which only
  // rejects dynamic-key schemas while wrapping a tool. Widening to every `$ref`
  // would reject tool schemas whose dangling reference sits in a branch the
  // interpreter never descends into, and which validate today.
  const toleratedOutsideDynamicKeys: ReadonlyArray<readonly [string, JsonSchema]> = [
    [
      'an unresolved $ref under a declared property',
      { type: 'object', properties: { a: { $ref: '#/$defs/Missing' } } },
    ],
    [
      'an unresolved $ref inside array items',
      { type: 'object', properties: { a: { type: 'array', items: { $ref: '#/$defs/Gone' } } } },
    ],
    [
      'an invalid pattern regular expression',
      { type: 'object', properties: { a: { type: 'string', pattern: '[' } } },
    ],
  ];

  for (const [label, schema] of toleratedOutsideDynamicKeys) {
    it(`leaves ${label} to the interpreter`, () => {
      expect(() => jsonSchemaToEffectSchema(schema)).not.toThrow();
    });
  }

  for (const [label, schema, message] of defects) {
    it(`rejects ${label}`, () => {
      expect(() => jsonSchemaToEffectSchema(schema)).toThrow(message);
    });
  }

  it('resolves a local $ref that does exist', () => {
    const schema = {
      type: 'object',
      properties: { a: { $ref: '#/$defs/Name' } },
      required: ['a'],
      $defs: { Name: { type: 'string' } },
    } satisfies JsonSchema;

    expect(() => jsonSchemaToEffectSchema(schema)).not.toThrow();
    expect(effectAccepts(schema, { a: 'Ada' })).toBe(true);
    expect(effectAccepts(schema, { a: 1 })).toBe(false);
  });

  it('accepts a self-referential $ref without re-entering it', () => {
    const schema = {
      type: 'object',
      properties: { next: { $ref: '#' } },
    } satisfies JsonSchema;

    expect(() => jsonSchemaToEffectSchema(schema)).not.toThrow();
    expect(effectAccepts(schema, { next: { next: {} } })).toBe(true);
  });
});

describe('input the interpreter cannot represent stays an input failure', () => {
  // The one throw in `validate` that depends on the instance rather than the
  // schema. It must stay inside the filter: throwing here would escape
  // `Schema.decodeUnknown` as a defect instead of a typed parse error.
  const unrepresentable: ReadonlyArray<readonly [string, unknown]> = [
    ['a bigint', BigInt(1)],
    ['a function', () => 1],
    ['a symbol', Symbol('x')],
    ['undefined', undefined],
  ];

  for (const [label, input] of unrepresentable) {
    it(`rejects ${label} without throwing`, () => {
      const schema = jsonSchemaToEffectSchema({ type: 'object' });
      expect(() => Schema.decodeUnknownOption(schema)(input)).not.toThrow();
      expect(Option.isSome(Schema.decodeUnknownOption(schema)(input))).toBe(false);
    });
  }
});
