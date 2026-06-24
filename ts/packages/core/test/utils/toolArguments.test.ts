import { describe, it, expect } from 'vitest';
import { normalizeToolArguments } from '../../src/utils/toolArguments';
import { ComposioInvalidToolArgumentsError } from '../../src/errors/ToolErrors';

describe('normalizeToolArguments (issue #2406)', () => {
  it('returns a plain object unchanged', () => {
    const input = { to: 'a@b.com', subject: 'hi' };
    expect(normalizeToolArguments(input)).toBe(input);
  });

  it('parses a stringified JSON object into an object', () => {
    const params = { to: 'a@b.com', subject: 'hi', body: 'Hello' };
    expect(normalizeToolArguments(JSON.stringify(params))).toEqual(params);
  });

  it.each([null, undefined])('coerces %s to an empty object', value => {
    expect(normalizeToolArguments(value)).toEqual({});
  });

  it.each(['', '   ', '\n\t '])(
    'coerces an empty/whitespace string %j to an empty object',
    value => {
      expect(normalizeToolArguments(value)).toEqual({});
    }
  );

  it('throws a typed error when the string is not valid JSON', () => {
    expect(() => normalizeToolArguments('{"to": "a@b.com"', 'GMAIL_SEND')).toThrow(
      ComposioInvalidToolArgumentsError
    );
    try {
      normalizeToolArguments('not json at all', 'GMAIL_SEND');
    } catch (error) {
      expect(error).toBeInstanceOf(ComposioInvalidToolArgumentsError);
      expect((error as Error).message).toContain("Tool 'GMAIL_SEND'");
      // The original SyntaxError is preserved as the cause for debugging.
      expect((error as { cause?: unknown }).cause).toBeInstanceOf(SyntaxError);
    }
  });

  it.each([
    ['a JSON array string', '[1, 2, 3]'],
    ['a JSON number string', '42'],
    ['a JSON string literal', '"hello"'],
  ])('throws when the parsed JSON %s is not an object', (_label, value) => {
    expect(() => normalizeToolArguments(value)).toThrow(ComposioInvalidToolArgumentsError);
  });

  it.each([
    ['an array', [1, 2, 3]],
    ['a number', 42],
    ['a boolean', true],
  ])('throws when given %s directly', (_label, value) => {
    expect(() => normalizeToolArguments(value)).toThrow(ComposioInvalidToolArgumentsError);
  });

  it('mentions the tool slug in the error message when provided', () => {
    expect(() => normalizeToolArguments(42, 'SLACK_SEND_MESSAGE')).toThrow(
      /Tool 'SLACK_SEND_MESSAGE'/
    );
  });

  it('falls back to a generic label when no slug is provided', () => {
    expect(() => normalizeToolArguments(42)).toThrow(/^.*\bTool expected arguments/);
  });
});
