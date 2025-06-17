import { describe, it, expect } from 'vitest';
import { unionType } from './UnionType';
import { namedType } from './NamedType';
import { stringLiteral } from './StringLiteralType';
import { Writer } from './Writer';

describe('UnionType multiline formatting', () => {
  it('should format simple union types in multiline style', () => {
    const union = unionType([namedType('string'), namedType('number'), namedType('boolean')]);

    const writer = new Writer(0, undefined);
    union.formatMultiline().write(writer);

    expect(writer.toString()).toBe(['', '  | string', '  | number', '  | boolean'].join('\n'));
  });

  it('should format string literal union types in multiline style', () => {
    const union = unionType([
      stringLiteral('success'),
      stringLiteral('error'),
      stringLiteral('pending'),
    ]);

    const writer = new Writer(0, undefined);
    union.formatMultiline().write(writer);

    expect(writer.toString()).toBe(
      ['', '  | "success"', '  | "error"', '  | "pending"'].join('\n')
    );
  });

  it('should still format inline when multiline is not enabled', () => {
    const union = unionType([namedType('string'), namedType('number'), namedType('boolean')]);

    const writer = new Writer(0, undefined);
    union.write(writer);

    expect(writer.toString()).toBe('string | number | boolean');
  });

  it('should handle single variant union in multiline', () => {
    const union = unionType(namedType('string'));

    const writer = new Writer(0, undefined);
    union.formatMultiline().write(writer);

    expect(writer.toString()).toBe(['', '  | string'].join('\n'));
  });

  it('should handle empty variants gracefully', () => {
    const union = unionType([namedType('string')]);
    union.variants.length = 0; // Force empty for edge case test

    const writer = new Writer(0, undefined);
    union.formatMultiline().write(writer);

    expect(writer.toString()).toBe('');
  });
});
