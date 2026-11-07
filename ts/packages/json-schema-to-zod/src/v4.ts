import type { ZodType } from 'zod/v4';
import { version } from 'zod/v4/core';

import { zodV4Backend } from './backend/zod-v4';
import { ZOD_V4_FLOOR, formatZodVersion, meetsZodV4Floor } from './backend/zod-v4-floor';
import type { OptionsOf, ParserOverrideOf, RefsOf } from './context';
import { createConverter } from './convert';
import type { JsonSchema, JsonSchemaObject } from './types';

export type { Serializable, JsonSchema, JsonSchemaObject } from './types';
export { InvalidPatternError, type InvalidPatternReason } from './utils/compile-pattern';

if (!meetsZodV4Floor(version)) {
  throw new Error(
    `@composio/json-schema-to-zod/v4 requires zod >= ${formatZodVersion(ZOD_V4_FLOOR)}; found ${formatZodVersion(version)}`
  );
}

export type ParserSelector = (schema: JsonSchemaObject, refs: Refs) => ZodType;
export type ParserOverride = ParserOverrideOf<ZodType>;
export type JsonSchemaToZodOptions = OptionsOf<ZodType> & {
  /** Leave out the forwarded `format`, `contentEncoding`, `contentMediaType`, and integer annotations. */
  withoutAnnotations?: boolean;
};
export type Refs = RefsOf<ZodType>;

/** A raw shape over zod v4 schemas, for APIs that take a shape rather than an object schema. */
export type SimpleZodRawShape = Record<string, ZodType>;

const converter = createConverter(zodV4Backend);

export const jsonSchemaToZod = (
  schema: JsonSchema,
  options: JsonSchemaToZodOptions = {}
): ZodType => converter.jsonSchemaToZod(schema, options);

export const jsonSchemaToZodShape = (
  schema: JsonSchema,
  options: JsonSchemaToZodOptions = {}
): SimpleZodRawShape => converter.jsonSchemaToZodShape(schema, options);
