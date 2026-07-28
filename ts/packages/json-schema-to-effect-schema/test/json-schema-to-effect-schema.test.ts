import { jsonSchemaToZod } from '@composio/json-schema-to-zod';
import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { jsonSchemaToEffectSchema, type JsonSchemaValidationIssue } from '../src/index';

type JsonSchema = Record<string, unknown>;

const effectAccepts = (schema: JsonSchema, input: unknown): boolean =>
  Either.isRight(
    Schema.decodeUnknownEither(jsonSchemaToEffectSchema(schema), { errors: 'all' })(input)
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

    const result = Schema.decodeUnknownEither(effectSchema, { errors: 'all' })({
      email: 42,
      profile: { age: 'old', extra: true },
      typo: true,
    });

    expect(Either.isLeft(result)).toBe(true);
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
