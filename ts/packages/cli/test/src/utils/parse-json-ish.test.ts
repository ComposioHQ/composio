import { describe, it, expect } from 'vitest';
import { parseJsonIsh } from 'src/utils/parse-json-ish';

describe('parseJsonIsh', () => {
  it('parses strict JSON', () => {
    expect(parseJsonIsh('{"foo": "bar", "n": 1}')).toEqual({ foo: 'bar', n: 1 });
    expect(parseJsonIsh('[1, 2, 3]')).toEqual([1, 2, 3]);
    expect(parseJsonIsh('"hello"')).toBe('hello');
    expect(parseJsonIsh('42')).toBe(42);
    expect(parseJsonIsh('null')).toBeNull();
  });

  it('parses JS-style object literals (unquoted keys, single quotes, trailing commas)', () => {
    expect(parseJsonIsh("{ foo: 'bar', trailing: 1, }")).toEqual({ foo: 'bar', trailing: 1 });
    expect(parseJsonIsh("{ nested: { a: [1, 2,], b: 'c' } }")).toEqual({
      nested: { a: [1, 2], b: 'c' },
    });
  });

  it('parses JSON with comments', () => {
    expect(
      parseJsonIsh(`{
        // line comment
        "foo": "bar",
        /* block comment */
        "n": 1
      }`)
    ).toEqual({ foo: 'bar', n: 1 });
  });

  it('does not execute code embedded in the input', () => {
    const globals = globalThis as { __pwned?: boolean };
    delete globals.__pwned;

    expect(() => parseJsonIsh('(globalThis.__pwned = true, {})')).toThrow();
    expect(globals.__pwned).toBeUndefined();

    expect(() => parseJsonIsh('process.exit(0)')).toThrow();
    expect(() => parseJsonIsh("require('node:child_process').execSync('true')")).toThrow();
    expect(() => parseJsonIsh('{ foo: (() => { globalThis.__pwned = true; })() }')).toThrow();
    expect(globals.__pwned).toBeUndefined();
  });

  it('rejects plain JS expressions instead of evaluating them', () => {
    expect(() => parseJsonIsh('1+1')).toThrow();
    expect(() => parseJsonIsh('[1, 2].map(x => x)')).toThrow();
    expect(() => parseJsonIsh('new Date()')).toThrow();
  });

  it('throws a parse error for garbage input', () => {
    expect(() => parseJsonIsh('not json at all!')).toThrow();
    expect(() => parseJsonIsh('')).toThrow();
  });
});
