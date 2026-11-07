/**
 * Pins the shape of every Zod v3 schema the root converter builds, as a JSON
 * Schema rendering plus a walk over `_def`. The snapshot is the reference
 * that structural refactors of the converter are checked against: a change
 * here is a change in what consumers receive, not an internal detail.
 */
import { describe, expect, it } from 'vitest';
import type { ZodTypeAny } from 'zod/v3';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { jsonSchemaToZod } from '../src/index';
import type { JsonSchema } from '../src/types';
import { loadObjectCases, loadStrictCases } from './fixtures/corpus';

type Fingerprint = Record<string, unknown>;

const checkFingerprint = (check: Record<string, unknown>): Fingerprint => {
  const { regex, ...rest } = check;
  return regex instanceof RegExp ? { ...rest, regex: regex.source } : rest;
};

const defFingerprint = (schema: ZodTypeAny): Fingerprint => {
  const def = schema._def as Record<string, unknown> & { typeName: string };
  const node: Fingerprint = { typeName: def.typeName };

  if (def.description !== undefined) node.description = def.description;
  if ('wholeSchemaGuard' in def) node.guarded = true;
  if (Array.isArray(def.checks)) {
    node.checks = def.checks.map(check => checkFingerprint(check as Record<string, unknown>));
  }

  switch (def.typeName) {
    case 'ZodObject': {
      const shape = (def.shape as () => Record<string, ZodTypeAny>)();
      node.shape = Object.fromEntries(
        Object.entries(shape).map(([key, value]) => [key, defFingerprint(value)])
      );
      node.unknownKeys = def.unknownKeys;
      node.catchall = defFingerprint(def.catchall as ZodTypeAny);
      break;
    }
    case 'ZodArray':
      node.element = defFingerprint(def.type as ZodTypeAny);
      if (def.minLength) node.minLength = def.minLength;
      if (def.maxLength) node.maxLength = def.maxLength;
      if (def.exactLength) node.exactLength = def.exactLength;
      break;
    case 'ZodTuple':
      node.items = (def.items as ZodTypeAny[]).map(defFingerprint);
      node.rest = def.rest ? defFingerprint(def.rest as ZodTypeAny) : null;
      break;
    case 'ZodUnion':
      node.options = (def.options as ZodTypeAny[]).map(defFingerprint);
      break;
    case 'ZodIntersection':
      node.left = defFingerprint(def.left as ZodTypeAny);
      node.right = defFingerprint(def.right as ZodTypeAny);
      break;
    case 'ZodRecord':
      node.keyType = defFingerprint(def.keyType as ZodTypeAny);
      node.valueType = defFingerprint(def.valueType as ZodTypeAny);
      break;
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodReadonly':
      node.innerType = defFingerprint(def.innerType as ZodTypeAny);
      break;
    case 'ZodDefault':
      node.innerType = defFingerprint(def.innerType as ZodTypeAny);
      node.defaultValue = (def.defaultValue as () => unknown)();
      break;
    case 'ZodEffects':
      node.effect = (def.effect as { type: string }).type;
      node.schema = defFingerprint(def.schema as ZodTypeAny);
      break;
    case 'ZodLiteral':
      node.value = def.value;
      break;
    case 'ZodEnum':
      node.values = def.values;
      break;
    default:
      break;
  }

  return node;
};

const fingerprint = (schema: JsonSchema): Fingerprint => {
  let converted: ZodTypeAny;
  try {
    converted = jsonSchemaToZod(schema);
  } catch (error) {
    return { conversionError: error instanceof Error ? error.name : String(error) };
  }
  return {
    jsonSchema: zodToJsonSchema(converted, { target: 'jsonSchema7' }),
    def: defFingerprint(converted),
  };
};

const localCases: ReadonlyArray<{ id: string; schema: JsonSchema }> = [
  {
    id: 'string-formats',
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        ip: { type: 'string', format: 'ip' },
        ipv4: { type: 'string', format: 'ipv4' },
        ipv6: { type: 'string', format: 'ipv6' },
        uri: { type: 'string', format: 'uri' },
        uuid: { type: 'string', format: 'uuid' },
        dateTime: { type: 'string', format: 'date-time' },
        time: { type: 'string', format: 'time' },
        date: { type: 'string', format: 'date' },
        duration: { type: 'string', format: 'duration' },
        binary: { type: 'string', format: 'binary' },
        byte: { type: 'string', format: 'byte' },
        base64: { type: 'string', contentEncoding: 'base64', contentMediaType: 'image/png' },
        hex: { type: 'string', contentEncoding: 'base16' },
        pattern: { type: 'string', pattern: '^[a-z\\_]+$', minLength: 1, maxLength: 8 },
        aliases: { type: 'string', min: 2, max: 4 },
      },
      required: ['email'],
    },
  },
  {
    id: 'number-constraints',
    schema: {
      type: 'object',
      properties: {
        integer: { type: 'integer', minimum: 1, maximum: 10 },
        int64: { type: 'number', format: 'int64' },
        unit: { type: 'number', multipleOf: 1 },
        decimal: { type: 'number', multipleOf: 0.1 },
        exclusive: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 100 },
        draft4: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 1 },
        aliases: { type: 'number', min: 0, max: 1 },
      },
    } as unknown as JsonSchema,
  },
  {
    id: 'metadata-and-wrappers',
    schema: {
      type: 'object',
      title: 'Request',
      description: 'A request',
      properties: {
        described: { type: 'string', description: 'Named', example: 'x' },
        titled: { type: 'string', title: 'Title only', examples: ['a', 'b'] },
        nullable: { type: 'integer', nullable: true, description: 'Maybe' },
        nullDefault: { type: 'string', default: null },
        defaulted: { type: 'string', default: 'x' },
        readOnly: { type: 'string', readOnly: true },
        nullableNullDefault: { type: 'string', nullable: true, default: null },
        anyOfNull: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
      } as Record<string, JsonSchema>,
    },
  },
  {
    id: 'combinators',
    schema: {
      type: 'object',
      properties: {
        oneOf: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        anyOf: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        allOf: {
          allOf: [
            { type: 'number', minimum: 0 },
            { type: 'number', maximum: 1 },
          ],
        },
        not: { not: { type: 'string' } },
        conditional: { if: { type: 'string' }, then: { minLength: 1 }, else: { type: 'number' } },
        multiple: { type: ['string', 'null'] },
        typeless: { minLength: 2 },
        enumObject: { enum: [{ a: 1 }, [1]] },
        constObject: { const: { a: 1 } },
        enumMixed: { enum: ['a', 1, true, null] },
        enumStrings: { type: 'string', enum: ['a', 'b'] },
        constString: { const: 'a' },
      },
    },
  },
  {
    id: 'containers',
    schema: {
      type: 'object',
      properties: {
        tuple: { type: 'array', items: [{ type: 'string' }, { type: 'integer' }] },
        closedTuple: {
          type: 'array',
          items: [{ type: 'string' }],
          additionalItems: false,
          minItems: 1,
          maxItems: 1,
        },
        typedRest: {
          type: 'array',
          items: [{ type: 'string' }],
          additionalItems: { type: 'number' },
        },
        list: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
        aliases: { type: 'array', items: { type: 'string' }, min: 1, max: 3 },
        bare: { type: 'array' },
        anyOfArray: {
          type: 'array',
          anyOf: [{ items: { type: 'string' } }, { items: { type: 'number' } }],
        },
        strict: {
          type: 'object',
          properties: { a: { type: 'string' } },
          additionalProperties: false,
        },
        open: { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: true },
        typed: {
          type: 'object',
          properties: { a: { type: 'string' } },
          additionalProperties: { type: 'number' },
        },
        record: { type: 'object', additionalProperties: { type: 'number' } },
        emptyStrict: { type: 'object', additionalProperties: false },
        emptyOpen: { type: 'object' },
        patterns: {
          type: 'object',
          properties: { a: { type: 'string' } },
          patternProperties: { '^p_': { type: 'number' } },
          additionalProperties: false,
        },
        patternsOnly: { type: 'object', patternProperties: { '^p_': { type: 'number' } } },
        implicit: { properties: { a: { type: 'string' } }, required: ['a'] },
      },
    },
  },
  {
    id: 'references-and-guards',
    schema: {
      type: 'object',
      properties: {
        ref: { $ref: '#/$defs/name' },
        nested: { type: 'object', properties: { ref: { $ref: '#/$defs/name' } } },
        unique: { type: 'array', uniqueItems: true },
        bounded: { type: 'object', minProperties: 1 },
      },
      required: ['ref'],
      $defs: { name: { type: 'string', pattern: '^[a-z]+$' } },
    },
  },
  { id: 'boolean-true', schema: true },
  { id: 'boolean-false', schema: false },
  { id: 'root-string', schema: { type: 'string', description: 'root' } },
  {
    id: 'root-nullable',
    schema: { type: 'string', nullable: true, default: null } as unknown as JsonSchema,
  },
  { id: 'root-ref', schema: { $defs: { n: { type: 'number' } }, $ref: '#/$defs/n' } },
];

describe('v3 output fingerprint', () => {
  it('matches the pinned snapshot for the shared object corpus', () => {
    const cases = loadObjectCases().map(({ id, schema }) => ({
      id,
      fingerprint: fingerprint(schema as JsonSchema),
    }));
    expect(cases).toMatchSnapshot();
  });

  it('matches the pinned snapshot for the shared strict corpus', () => {
    const cases = loadStrictCases().map(({ id, schema }) => ({
      id,
      fingerprint: fingerprint(schema as JsonSchema),
    }));
    expect(cases).toMatchSnapshot();
  });

  it('matches the pinned snapshot for the local cases', () => {
    const cases = localCases.map(({ id, schema }) => ({ id, fingerprint: fingerprint(schema) }));
    expect(cases).toMatchSnapshot();
  });
});
