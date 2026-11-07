import { isAssertedStringFormat } from '../annotations';
import type { ParseContext } from '../context';
import type { JsonSchemaObject } from '../types';
import { compilePattern } from '../utils/compile-pattern';
import { extendSchemaWithMessage } from '../utils/extend-schema';

export const parseString = <S>(
  jsonSchema: JsonSchemaObject & { type: 'string' },
  ctx: Pick<ParseContext<S>, 'path' | 'backend'>
): S => {
  const { backend } = ctx;
  let zodSchema = backend.string();

  zodSchema = extendSchemaWithMessage(zodSchema, jsonSchema, 'format', (zs, format, errorMsg) =>
    isAssertedStringFormat(format) ? backend.stringFormat(zs, format, errorMsg) : zs
  );

  // `contentEncoding` names how the string encodes its bytes; only base64 is
  // checked. Other encodings (base16, base32, quoted-printable, ...) are left
  // unvalidated, and `format: "binary"` (OpenAPI: any sequence of octets) is
  // not an encoding at all. Encoding names are case-insensitive (RFC 2045).
  zodSchema = extendSchemaWithMessage(
    zodSchema,
    jsonSchema,
    'contentEncoding',
    (zs, encoding, errorMsg) => (isBase64Encoding(encoding) ? backend.base64(zs, errorMsg) : zs)
  );
  zodSchema = extendSchemaWithMessage(zodSchema, jsonSchema, 'pattern', (zs, pattern, errorMsg) =>
    backend.regex(zs, compilePattern('pattern', pattern, ctx), errorMsg)
  );
  // JSON Schema length constraints count Unicode code points, while Zod's
  // built-in `.min()`/`.max()` count UTF-16 code units and overcount astral
  // glyphs, so both bounds are applied as code-point refinements.
  const errorMessages = (jsonSchema as { errorMessage?: Record<string, string> }).errorMessage;
  // 'min'/'max' are generic aliases for 'minLength'/'maxLength'
  const minLength =
    typeof jsonSchema.minLength === 'number'
      ? jsonSchema.minLength
      : typeof jsonSchema.min === 'number'
        ? jsonSchema.min
        : undefined;
  const maxLength =
    typeof jsonSchema.maxLength === 'number'
      ? jsonSchema.maxLength
      : typeof jsonSchema.max === 'number'
        ? jsonSchema.max
        : undefined;

  let result = zodSchema;
  if (minLength !== undefined) {
    result = backend.refine<string>(
      result,
      value => codePointLength(value) >= minLength,
      errorMessages?.minLength ?? `String must contain at least ${minLength} character(s)`
    );
  }
  if (maxLength !== undefined) {
    result = backend.refine<string>(
      result,
      value => codePointLength(value) <= maxLength,
      errorMessages?.maxLength ?? `String must contain at most ${maxLength} character(s)`
    );
  }

  return result;
};

const codePointLength = (value: string): number => [...value].length;

const isBase64Encoding = (encoding: unknown): boolean =>
  typeof encoding === 'string' && encoding.toLowerCase() === 'base64';
