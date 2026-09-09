import { describe, expect, it } from 'vitest';

import { InvalidPatternError, jsonSchemaToZod } from '../src/index';
import {
  MAX_PATTERN_LENGTH,
  compilePattern,
  hasNestedUnboundedQuantifier,
} from '../src/utils/compile-pattern';

const invalidPatternAt = (build: () => unknown): InvalidPatternError => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidPatternError);
    return error as InvalidPatternError;
  }
  throw new Error('expected conversion to fail');
};

describe('hasNestedUnboundedQuantifier', () => {
  it.each([
    '^(a+)+$',
    '(a*)*',
    '^(a+)*$',
    '(a{2,})+',
    '(a+){3,}',
    '((ab)+c)*',
    '(?:x+)+',
    '(\\d*x)*',
    '(a+)+?',
  ])('flags %s', pattern => {
    expect(hasNestedUnboundedQuantifier(pattern)).toBe(true);
  });

  it.each([
    '^[a-z]+$',
    '^\\d{4}-\\d{2}-\\d{2}$',
    '(a+)',
    '(a)+',
    '(a+){2}',
    '(a{2,5})+',
    '(a+){2,5}',
    '[(+)]+',
    '\\(a+\\)+',
    '(a+)b+',
    '^(?:[a-z]+\\.){0,3}[a-z]+$',
    '^(\\d+\\.){2}\\d+$',
  ])('accepts %s', pattern => {
    expect(hasNestedUnboundedQuantifier(pattern)).toBe(false);
  });
});

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
      compilePattern('patternProperties', '^(a+)+$', { path: ['properties', 'tags'] })
    );
    expect(error.reason).toBe('nested-quantifier');
    expect(error.path).toEqual(['properties', 'tags', 'patternProperties', '^(a+)+$']);
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

  it('rejects a catastrophic pattern before it can be evaluated', () => {
    const started = performance.now();
    const error = invalidPatternAt(() =>
      jsonSchemaToZod({
        type: 'object',
        properties: { code: { type: 'string', pattern: '^(a+)+$' } },
      })
    );
    expect(error.reason).toBe('nested-quantifier');
    expect(error.message).toContain('at properties.code');
    expect(performance.now() - started).toBeLessThan(1000);
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
            patternProperties: { '^(x*)*$': { type: 'string' } },
          },
        },
      })
    );
    expect(error.keyword).toBe('patternProperties');
    expect(error.path).toEqual(['properties', 'labels', 'patternProperties', '^(x*)*$']);
    expect(error.message).toContain('at properties.labels.patternProperties.^(x*)*$');
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
