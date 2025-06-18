import { describe, it, expect } from 'vitest';
import { QuoteStyle, escapeStringContent } from './QuoteStyle';
import { stringLiteral } from './StringLiteralType';
import { Writer } from './Writer';

describe('QuoteStyle', () => {
  describe('escapeStringContent', () => {
    it('should format with double quotes', () => {
      expect(escapeStringContent('hello', QuoteStyle.Double)).toBe('"hello"');
      expect(escapeStringContent('hello "world"', QuoteStyle.Double)).toBe('"hello \\"world\\""');
      expect(escapeStringContent("hello 'world'", QuoteStyle.Double)).toBe('"hello \'world\'"');
    });

    it('should format with single quotes', () => {
      expect(escapeStringContent('hello', QuoteStyle.Single)).toBe("'hello'");
      expect(escapeStringContent("hello 'world'", QuoteStyle.Single)).toBe("'hello \\'world\\''");
      expect(escapeStringContent('hello "world"', QuoteStyle.Single)).toBe('\'hello "world"\'');
    });

    it('should format with backticks', () => {
      expect(escapeStringContent('hello', QuoteStyle.Backtick)).toBe('`hello`');
      expect(escapeStringContent('hello `world`', QuoteStyle.Backtick)).toBe('`hello \\`world\\``');
      expect(escapeStringContent('hello $world', QuoteStyle.Backtick)).toBe('`hello \\$world`');
    });

    it('should handle backslashes correctly', () => {
      expect(escapeStringContent('hello\\world', QuoteStyle.Double)).toBe('"hello\\\\world"');
      expect(escapeStringContent('hello\\world', QuoteStyle.Single)).toBe("'hello\\\\world'");
      expect(escapeStringContent('hello\\world', QuoteStyle.Backtick)).toBe('`hello\\\\world`');
    });
  });

  describe('StringLiteralType with different quote styles', () => {
    it('should use double quotes by default', () => {
      const literal = stringLiteral('hello world');
      const writer = new Writer(0, undefined);
      literal.write(writer);
      expect(writer.toString()).toBe('"hello world"');
    });

    it('should use single quotes when configured', () => {
      const literal = stringLiteral('hello world');
      const writer = new Writer(0, undefined, { quoteStyle: QuoteStyle.Single });
      literal.write(writer);
      expect(writer.toString()).toBe("'hello world'");
    });

    it('should use backticks when configured', () => {
      const literal = stringLiteral('hello world');
      const writer = new Writer(0, undefined, { quoteStyle: QuoteStyle.Backtick });
      literal.write(writer);
      expect(writer.toString()).toBe('`hello world`');
    });

    it('should handle quotes in content correctly', () => {
      const literal = stringLiteral('hello "world"');

      // Double quotes - content quotes are escaped
      const doubleWriter = new Writer(0, undefined, { quoteStyle: QuoteStyle.Double });
      literal.write(doubleWriter);
      expect(doubleWriter.toString()).toBe('"hello \\"world\\""');

      // Single quotes - content quotes are not escaped
      const singleWriter = new Writer(0, undefined, { quoteStyle: QuoteStyle.Single });
      literal.write(singleWriter);
      expect(singleWriter.toString()).toBe('\'hello "world"\'');
    });

    it('should handle single quotes in content correctly', () => {
      const literal = stringLiteral("hello 'world'");

      // Double quotes - content quotes are not escaped
      const doubleWriter = new Writer(0, undefined, { quoteStyle: QuoteStyle.Double });
      literal.write(doubleWriter);
      expect(doubleWriter.toString()).toBe('"hello \'world\'"');

      // Single quotes - content quotes are escaped
      const singleWriter = new Writer(0, undefined, { quoteStyle: QuoteStyle.Single });
      literal.write(singleWriter);
      expect(singleWriter.toString()).toBe("'hello \\'world\\''");
    });

    it('should handle special characters in backticks', () => {
      const literal = stringLiteral('hello `$world`');
      const writer = new Writer(0, undefined, { quoteStyle: QuoteStyle.Backtick });
      literal.write(writer);
      expect(writer.toString()).toBe('`hello \\`\\$world\\``');
    });
  });
});
