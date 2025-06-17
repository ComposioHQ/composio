/**
 * Configuration for quote styles in string literals
 */

export enum QuoteStyle {
  /** Use double quotes: "hello" */
  Double = 'double',
  /** Use single quotes: 'hello' */
  Single = 'single',
  /** Use backticks for template literals: `hello` */
  Backtick = 'backtick',
}

/**
 * Configuration options for code generation
 */
export interface FormattingOptions {
  /** Quote style for string literals */
  quoteStyle: QuoteStyle;
}

/**
 * Default formatting options
 */
export const DEFAULT_FORMATTING_OPTIONS: FormattingOptions = {
  quoteStyle: QuoteStyle.Double,
};

/**
 * Escapes a string content for the specified quote style
 */
export function escapeStringContent(content: string, quoteStyle: QuoteStyle): string {
  switch (quoteStyle) {
    case QuoteStyle.Double:
      return JSON.stringify(content);

    case QuoteStyle.Single:
      return "'" + content.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

    case QuoteStyle.Backtick:
      return '`' + content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$') + '`';

    default:
      throw new Error(`Unsupported quote style: ${quoteStyle}`);
  }
}
