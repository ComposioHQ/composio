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
import {
  hasTypelessScalarConstraints,
  parseTypelessConstraints,
} from './parse-typeless-constraints';
import { collectAnnotations, describeText } from '../annotations';
import type { ParseContext } from '../context';
import type { JsonSchemaObject, JsonSchema } from '../types';
import { its } from '../utils/its';
import {
  createWholeSchemaGuard,
  guardSchemaAt,
  requiresPermissiveMaterialization,
} from '../whole-schema-validation';

const addDecorations = <S>(jsonSchema: JsonSchemaObject, zodSchema: S, ctx: ParseContext<S>): S => {
  const description = ctx.withoutDescribes ? undefined : describeText(jsonSchema);
  const annotations = ctx.withoutAnnotations ? undefined : collectAnnotations(jsonSchema);

  if (description === undefined && annotations === undefined) {
    return zodSchema;
  }

  return ctx.backend.decorate(zodSchema, { description, annotations });
};

const addDefaults = <S>(jsonSchema: JsonSchemaObject, zodSchema: S, ctx: ParseContext<S>): S => {
  if (jsonSchema.default !== undefined) {
    // Don't apply null defaults to non-nullable types within anyOf/oneOf contexts
    if (jsonSchema.default === null) {
      // Check if we're in an anyOf/oneOf context by examining the path
      const inAnyOfOrOneOf = ctx.path.some(segment => segment === 'anyOf' || segment === 'oneOf');

      // If we're in anyOf/oneOf and this is a non-nullable type, skip the default
      if (
        inAnyOfOrOneOf &&
        jsonSchema.type &&
        jsonSchema.type !== 'null' &&
        // @ts-expect-error: `nullable` is not publicly available in Zod 4
        !jsonSchema.nullable
      ) {
        return zodSchema;
      }
    }

    return ctx.backend.withDefault(zodSchema, jsonSchema.default);
  }

  return zodSchema;
};

const addAnnotations = <S>(jsonSchema: JsonSchemaObject, zodSchema: S, ctx: ParseContext<S>): S => {
  if (jsonSchema.readOnly) {
    return ctx.backend.readonly(zodSchema);
  }

  return zodSchema;
};

const selectParser = <S>(schema: JsonSchemaObject, ctx: ParseContext<S>): S => {
  if (requiresPermissiveMaterialization(schema)) {
    // Widen only this node, and let it guard itself so combinators such as
    // `oneOf` still discriminate between branches that were widened.
    return ctx.backend.attachGuard(
      ctx.backend.any(),
      createWholeSchemaGuard(guardSchemaAt(schema, ctx))
    );
  } else if (its.a.nullable(schema)) {
    return parseNullable(schema, ctx);
  } else if (its.an.enum(schema)) {
    // `enum`/`const` intersect the declared type, so they must win over the
    // object and array parsers or a literal object/array value is never checked.
    return parseEnum(schema, ctx);
  } else if (its.a.const(schema)) {
    return parseConst(schema, ctx);
  } else if (its.an.object(schema)) {
    return parseObject(schema, ctx);
  } else if (its.an.array(schema)) {
    return parseArray(schema, ctx);
  } else if (its.an.anyOf(schema)) {
    return parseAnyOf(schema, ctx);
  } else if (its.an.allOf(schema)) {
    return parseAllOf(schema, ctx);
  } else if (its.a.oneOf(schema)) {
    return parseOneOf(schema, ctx);
  } else if (its.a.not(schema)) {
    return parseNot(schema, ctx);
  } else if (hasTypelessScalarConstraints(schema)) {
    return parseTypelessConstraints(schema, ctx);
  } else if (its.a.multipleType(schema)) {
    return parseMultipleType(schema, ctx);
  } else if (its.a.primitive(schema, 'string')) {
    return parseString(schema, ctx);
  } else if (its.a.primitive(schema, 'number') || its.a.primitive(schema, 'integer')) {
    return parseNumber(schema, ctx.backend);
  } else if (its.a.primitive(schema, 'boolean')) {
    return parseBoolean(schema, ctx);
  } else if (its.a.primitive(schema, 'null')) {
    return parseNull(schema, ctx);
  } else if (its.a.conditional(schema)) {
    return parseIfThenElse(schema, ctx);
  } else {
    return parseDefault(schema, ctx);
  }
};

export const parseSchema = <S>(
  jsonSchema: JsonSchema,
  ctx: ParseContext<S>,
  blockMeta?: boolean
): S => {
  const { backend } = ctx;
  if (typeof jsonSchema !== 'object') return jsonSchema ? backend.any() : backend.never();

  if (ctx.parserOverride) {
    const custom = ctx.parserOverride(jsonSchema, ctx);

    if (backend.isSchema(custom)) {
      return custom;
    }
  }

  let seen = ctx.seen.get(jsonSchema);

  if (seen) {
    if (seen.r !== undefined) {
      return seen.r;
    }

    if (ctx.depth === undefined || seen.n >= ctx.depth) {
      return backend.any();
    }

    seen.n += 1;
  } else {
    seen = { r: undefined, n: 0 };
    ctx.seen.set(jsonSchema, seen);
  }

  let parsedZodSchema = selectParser(jsonSchema, ctx);
  if (!blockMeta) {
    parsedZodSchema = addDecorations(jsonSchema, parsedZodSchema, ctx);

    if (!ctx.withoutDefaults) {
      parsedZodSchema = addDefaults(jsonSchema, parsedZodSchema, ctx);
    }

    parsedZodSchema = addAnnotations(jsonSchema, parsedZodSchema, ctx);
  }

  seen.r = parsedZodSchema;

  return parsedZodSchema;
};
