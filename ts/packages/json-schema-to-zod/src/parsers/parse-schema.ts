import { $ZodType } from 'zod/v4/core';
import * as z from 'zod';

import { parseAllOf } from './parse-all-of';
import { parseAnyOf } from './parse-any-of';
import { parseArray } from './parse-array';
import { parseBoolean } from './parse-boolean';
import { parseConst } from './parse-const';
import { parseDefault } from './parse-default';
import { parseEnum } from './parse-enum';
import { parseIfThenElse } from './parse-if-then-else';
import { parseMultipleType } from './parse-multiple-type';
import { parseNot } from './parse-not';
import { parseNull } from './parse-null';
import { parseNullable } from './parse-nullable';
import { parseNumber } from './parse-number';
import { parseObject } from './parse-object';
import { parseOneOf } from './parse-one-of';
import { parseString } from './parse-string';
import type { ParserSelector, Refs, JsonSchemaObject, JsonSchema } from '../types';
import { its } from '../utils/its';

const addDescribes = (jsonSchema: JsonSchemaObject, zodSchema: $ZodType): $ZodType => {
  let description = '';

  if (jsonSchema.description) {
    description = jsonSchema.description;
  } else if (jsonSchema.title) {
    description = jsonSchema.title;
  }

  // Append example(s) if they exist
  if ((jsonSchema as unknown as { example?: unknown }).example !== undefined) {
    const exampleText = `Example: ${JSON.stringify((jsonSchema as unknown as { example?: unknown }).example)}`;
    description = description ? `${description}\n${exampleText}` : exampleText;
  } else if (
    (jsonSchema as unknown as { examples?: unknown[] }).examples !== undefined &&
    Array.isArray((jsonSchema as unknown as { examples?: unknown[] }).examples)
  ) {
    const examples = (jsonSchema as unknown as { examples?: unknown[] }).examples;
    if (examples && examples.length && examples.length > 0) {
      const exampleText =
        examples.length === 1
          ? `Example: ${JSON.stringify(examples[0])}`
          : `Examples:\n${examples.map((ex: unknown) => `  ${JSON.stringify(ex)}`).join('\n')}`;
      description = description ? `${description}\n${exampleText}` : exampleText;
    }
  }

  if (description) {
    // @ts-ignore
    zodSchema = zodSchema.describe(description);
  }

  return zodSchema;
};

const addDefaults = (jsonSchema: JsonSchemaObject, zodSchema: $ZodType, refs?: Refs): $ZodType => {
  if (jsonSchema.default !== undefined) {
    // Don't apply null defaults to non-nullable types within anyOf/oneOf contexts
    if (jsonSchema.default === null) {
      // Check if we're in an anyOf/oneOf context by examining the path
      const inAnyOfOrOneOf = refs?.path.some(segment => segment === 'anyOf' || segment === 'oneOf');

      // If we're in anyOf/oneOf and this is a non-nullable type, skip the default
      if (inAnyOfOrOneOf && jsonSchema.type && jsonSchema.type !== 'null' && !jsonSchema.nullable) {
        return zodSchema;
      }
    }

    zodSchema = z.prefault(zodSchema, jsonSchema.default);
  }

  return zodSchema;
};

const addAnnotations = (jsonSchema: JsonSchemaObject, zodSchema: $ZodType): $ZodType => {
  if (jsonSchema.readOnly) {
    zodSchema = z.readonly(zodSchema);
  }

  return zodSchema;
};

const selectParser: ParserSelector = (schema, refs) => {
  if (its.a.nullable(schema)) {
    return parseNullable(schema, refs);
  } else if (its.an.object(schema)) {
    return parseObject(schema, refs);
  } else if (its.an.array(schema)) {
    return parseArray(schema, refs);
  } else if (its.an.anyOf(schema)) {
    return parseAnyOf(schema, refs);
  } else if (its.an.allOf(schema)) {
    return parseAllOf(schema, refs);
  } else if (its.a.oneOf(schema)) {
    return parseOneOf(schema, refs);
  } else if (its.a.not(schema)) {
    return parseNot(schema, refs);
  } else if (its.an.enum(schema)) {
    return parseEnum(schema); //<-- needs to come before primitives
  } else if (its.a.const(schema)) {
    return parseConst(schema);
  } else if (its.a.multipleType(schema)) {
    return parseMultipleType(schema, refs);
  } else if (its.a.primitive(schema, 'string')) {
    return parseString(schema);
  } else if (its.a.primitive(schema, 'number') || its.a.primitive(schema, 'integer')) {
    return parseNumber(schema);
  } else if (its.a.primitive(schema, 'boolean')) {
    return parseBoolean(schema);
  } else if (its.a.primitive(schema, 'null')) {
    return parseNull(schema);
  } else if (its.a.conditional(schema)) {
    return parseIfThenElse(schema, refs);
  } else {
    return parseDefault(schema);
  }
};

export const parseSchema = (
  jsonSchema: JsonSchema,
  refs: Refs = { seen: new Map(), path: [] },
  blockMeta?: boolean
): $ZodType => {
  if (typeof jsonSchema !== 'object') return jsonSchema ? z.any() : z.never();

  if (refs.parserOverride) {
    const custom = refs.parserOverride(jsonSchema, refs);

    if (custom instanceof $ZodType) {
      return custom;
    }
  }

  let seen = refs.seen.get(jsonSchema);

  if (seen) {
    if (seen.r !== undefined) {
      return seen.r;
    }

    if (refs.depth === undefined || seen.n >= refs.depth) {
      return z.any();
    }

    seen.n += 1;
  } else {
    seen = { r: undefined, n: 0 };
    refs.seen.set(jsonSchema, seen);
  }

  let parsedZodSchema = selectParser(jsonSchema, refs);
  if (!blockMeta) {
    if (!refs.withoutDescribes) {
      parsedZodSchema = addDescribes(jsonSchema, parsedZodSchema);
    }

    if (!refs.withoutDefaults) {
      parsedZodSchema = addDefaults(jsonSchema, parsedZodSchema, refs);
    }

    parsedZodSchema = addAnnotations(jsonSchema, parsedZodSchema);
  }

  seen.r = parsedZodSchema;

  return parsedZodSchema;
};
