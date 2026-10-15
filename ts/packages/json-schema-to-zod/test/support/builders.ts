/**
 * The builders the shared suites run against. Each wraps one converter entry
 * behind the same small runtime surface, so a suite states JSON Schema
 * expectations once and every builder is held to them.
 */
import type { ZodTypeAny } from 'zod/v3';
import { version } from 'zod/v4/core';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { meetsZodV4Floor } from '../../src/backend/zod-v4-floor';

import {
  jsonSchemaToZod as v3Convert,
  jsonSchemaToZodShape as v3ConvertShape,
} from '../../src/index';
import type { JsonSchema } from '../../src/types';
import * as z3 from 'zod/v3';

export type Issue = {
  readonly code: string;
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
};

export type SafeParseResult =
  | { readonly success: true; readonly data: unknown }
  | { readonly success: false; readonly error: { readonly issues: ReadonlyArray<Issue> } };

export interface RuntimeSchema {
  parse(value: unknown): unknown;
  safeParse(value: unknown): SafeParseResult;
  describe(description: string): RuntimeSchema;
}

export type ConvertOptions = {
  readonly withoutDefaults?: boolean;
  readonly withoutDescribes?: boolean;
  readonly depth?: number;
};

export type SchemaKind = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' | 'other';

export interface Builder {
  readonly name: 'zod-v3' | 'zod-v4';
  convert(schema: JsonSchema, options?: ConvertOptions): RuntimeSchema;
  convertShape(schema: JsonSchema, options?: ConvertOptions): Record<string, RuntimeSchema>;
  objectFromShape(shape: Record<string, RuntimeSchema>): RuntimeSchema;
  kind(schema: RuntimeSchema): SchemaKind;
  shape(schema: RuntimeSchema): Record<string, RuntimeSchema>;
  description(schema: RuntimeSchema): string | undefined;
  toJsonSchema(schema: RuntimeSchema): Record<string, unknown>;
}

const V3_KINDS: Record<string, SchemaKind> = {
  ZodString: 'string',
  ZodNumber: 'number',
  ZodBoolean: 'boolean',
  ZodNull: 'null',
  ZodObject: 'object',
  ZodArray: 'array',
};

const asV3 = (schema: RuntimeSchema): ZodTypeAny => schema as unknown as ZodTypeAny;

export const v3: Builder = {
  name: 'zod-v3',
  convert: (schema, options) => v3Convert(schema, options) as RuntimeSchema,
  convertShape: (schema, options) =>
    v3ConvertShape(schema, options) as Record<string, RuntimeSchema>,
  objectFromShape: shape =>
    z3.object(shape as unknown as Record<string, ZodTypeAny>) as unknown as RuntimeSchema,
  kind: schema => V3_KINDS[asV3(schema)._def.typeName] ?? 'other',
  shape: schema => (asV3(schema) as z3.AnyZodObject).shape as Record<string, RuntimeSchema>,
  description: schema => asV3(schema).description,
  toJsonSchema: schema =>
    zodToJsonSchema(asV3(schema), { target: 'jsonSchema7' }) as Record<string, unknown>,
};

/** The v4 builder joins only where the installed zod copy meets the `/v4` floor. */
export const builders: ReadonlyArray<Builder> = meetsZodV4Floor(version)
  ? [v3, (await import('./builder-v4')).v4]
  : [v3];
