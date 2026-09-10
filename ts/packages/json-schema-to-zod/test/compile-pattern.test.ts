import { describe, expect, it } from 'vitest';

import { InvalidPatternError, jsonSchemaToZod } from '../src/index';
import { MAX_PATTERN_LENGTH, compilePattern } from '../src/utils/compile-pattern';

const invalidPatternAt = (build: () => unknown): InvalidPatternError => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidPatternError);
    return error as InvalidPatternError;
  }
  throw new Error('expected conversion to fail');
};

describe('compilePattern', () => {
  it('compiles a valid pattern into an equivalent RegExp', () => {
    const regex = compilePattern('pattern', '^[a-z]+$', { path: [] });
    expect(regex.test('abc')).toBe(true);
    expect(regex.test('ABC')).toBe(false);
  });

  it('turns a RegExp SyntaxError into an InvalidPatternError that keeps the cause', () => {
    const error = invalidPatternAt(() =>
      compilePattern('pattern', '(', { path: ['properties', 'name'] })
    );
    expect(error.reason).toBe('syntax');
    expect(error.path).toEqual(['properties', 'name']);
    expect(error.cause).toBeInstanceOf(SyntaxError);
    expect(error.message).toContain('at properties.name');
  });

  it('rejects patterns above the length cap', () => {
    const error = invalidPatternAt(() =>
      compilePattern('pattern', 'a'.repeat(MAX_PATTERN_LENGTH + 1), { path: [] })
    );
    expect(error.reason).toBe('too-long');
    expect(error.message).toContain('<root>');
  });

  it('appends the patternProperties key to the reported path', () => {
    const error = invalidPatternAt(() =>
      compilePattern('patternProperties', '[', { path: ['properties', 'tags'] })
    );
    expect(error.reason).toBe('syntax');
    expect(error.path).toEqual(['properties', 'tags', 'patternProperties', '[']);
  });
});

describe('jsonSchemaToZod pattern guard', () => {
  it('reports a malformed property pattern with its path instead of a raw SyntaxError', () => {
    const error = invalidPatternAt(() =>
      jsonSchemaToZod({
        type: 'object',
        properties: { name: { type: 'string', pattern: '(' } },
      })
    );
    expect(error).not.toBeInstanceOf(SyntaxError);
    expect(error.keyword).toBe('pattern');
    expect(error.pattern).toBe('(');
    expect(error.message).toContain('at properties.name');
  });

  it('reports a typeless pattern with the path of the node carrying it', () => {
    const error = invalidPatternAt(() =>
      jsonSchemaToZod({
        type: 'object',
        properties: { slug: { pattern: '[' } },
      })
    );
    expect(error.path).toEqual(['properties', 'slug']);
  });

  it('reports a malformed patternProperties key with its path', () => {
    const error = invalidPatternAt(() =>
      jsonSchemaToZod({
        type: 'object',
        properties: {
          labels: {
            type: 'object',
            patternProperties: { '^x-(': { type: 'string' } },
          },
        },
      })
    );
    expect(error.keyword).toBe('patternProperties');
    expect(error.path).toEqual(['properties', 'labels', 'patternProperties', '^x-(']);
    expect(error.message).toContain('at properties.labels.patternProperties.^x-(');
  });

  it('keeps compiling quantified groups that backtrack linearly', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { version: { type: 'string', pattern: '^(\\d+\\.)*\\d+$' } },
      required: ['version'],
    });

    expect(schema.safeParse({ version: '1.2.3' }).success).toBe(true);
    expect(schema.safeParse({ version: '42' }).success).toBe(true);
    expect(schema.safeParse({ version: '1.2.' }).success).toBe(false);
    expect(schema.safeParse({ version: 'v1' }).success).toBe(false);
  });

  it('still enforces valid patterns', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[a-z]{3}-\\d+$' },
        meta: { type: 'object', patternProperties: { '^x-': { type: 'number' } } },
      },
      required: ['id'],
    });

    expect(schema.safeParse({ id: 'abc-42', meta: { 'x-rate': 1 } }).success).toBe(true);
    expect(schema.safeParse({ id: 'ABC-42' }).success).toBe(false);
    expect(schema.safeParse({ id: 'abc-42', meta: { 'x-rate': 'one' } }).success).toBe(false);
  });
});
