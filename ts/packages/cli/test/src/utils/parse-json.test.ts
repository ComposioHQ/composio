import { describe, expect, it } from '@effect/vitest';
import { Either } from 'effect';
import { JsonParsingError, parseJsonRecord } from 'src/utils/parse-json';

const parse = (raw: string) => Either.getOrThrowWith(parseJsonRecord(raw), error => error);
const parseError = (raw: string) => Either.flip(parseJsonRecord(raw)).pipe(Either.getOrNull);

describe('parseJsonRecord', () => {
  it('parses strict JSON objects', () => {
    expect(parse('{"foo": "bar", "n": 1}')).toEqual({ foo: 'bar', n: 1 });
  });

  it('parses JS-style object literals (unquoted keys, single quotes, trailing commas)', () => {
    expect(parse("{ foo: 'bar', trailing: 1, }")).toEqual({ foo: 'bar', trailing: 1 });
    expect(parse("{ nested: { a: [1, 2,], b: 'c' } }")).toEqual({
      nested: { a: [1, 2], b: 'c' },
    });
  });

  it('parses JSON with comments', () => {
    expect(
      parse(`{
        // line comment
        "foo": "bar",
        /* block comment */
        "n": 1
      }`)
    ).toEqual({ foo: 'bar', n: 1 });
  });

  it('fails for JSON values that are not objects', () => {
    expect(parseError('[1, 2, 3]')).toBeInstanceOf(JsonParsingError);
    expect(parseError('"hello"')).toBeInstanceOf(JsonParsingError);
    expect(parseError('42')).toBeInstanceOf(JsonParsingError);
    expect(parseError('null')).toBeInstanceOf(JsonParsingError);
  });

  it('does not execute code embedded in the input', () => {
    const globals = globalThis as { __pwned?: boolean };
    delete globals.__pwned;

    expect(parseError('(globalThis.__pwned = true, {})')).toBeInstanceOf(JsonParsingError);
    expect(globals.__pwned).toBeUndefined();

    expect(parseError('process.exit(0)')).toBeInstanceOf(JsonParsingError);
    expect(parseError("require('node:child_process').execSync('true')")).toBeInstanceOf(
      JsonParsingError
    );
    expect(parseError('{ foo: (() => { globalThis.__pwned = true; })() }')).toBeInstanceOf(
      JsonParsingError
    );
    expect(globals.__pwned).toBeUndefined();
  });

  it('rejects plain JS expressions instead of evaluating them', () => {
    expect(parseError('1+1')).toBeInstanceOf(JsonParsingError);
    expect(parseError('[1, 2].map(x => x)')).toBeInstanceOf(JsonParsingError);
    expect(parseError('new Date()')).toBeInstanceOf(JsonParsingError);
  });

  it('fails for garbage input', () => {
    expect(parseError('not json at all!')).toBeInstanceOf(JsonParsingError);
    expect(parseError('')).toBeInstanceOf(JsonParsingError);
  });
});
