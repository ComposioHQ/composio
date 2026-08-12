import * as z from 'zod/v3';

import { parseAllOf } from './parse-all-of';
import { parseAnyOf } from './parse-any-of';
import { parseOneOf } from './parse-one-of';
import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs, JsonSchema } from '../types';
import { its } from '../utils/its';

/**
 * Build the static part of an object parser, or `undefined` when the schema
 * declares no named properties.
 *
 * A property-less object (`properties` absent or `{}`) deliberately returns
 * `undefined` so the caller can apply the open-object policy. This supersedes
 * an earlier `z.object({})` fallback that was kept "or else this will break
 * openai responses": collapsing `{ type: "object" }` to a strict empty object
 * is the defect it was masking, and the OpenAI provider suite is part of this
 * package's verification precisely so the claim stays checked.
 */
function parseObjectProperties(objectSchema: JsonSchemaObject & { type?: 'object' }, refs: Refs) {
  if (!objectSchema.properties) {
    return undefined;
  }

  const propertyKeys = Object.keys(objectSchema.properties);
  if (propertyKeys.length === 0) {
    return undefined;
  }

  const properties: Record<string, z.ZodTypeAny> = {};

  for (const key of propertyKeys) {
    const propJsonSchema = objectSchema.properties[key];

    const propZodSchema = parseSchema(propJsonSchema, {
      ...refs,
      path: [...refs.path, 'properties', key],
    });

    const required = Array.isArray(objectSchema.required)
      ? objectSchema.required.includes(key)
      : false;

    // Handle default values for optional properties
    if (
      !required &&
      propJsonSchema &&
      typeof propJsonSchema === 'object' &&
      'default' in propJsonSchema
    ) {
      // If default is null, make the field nullable with the null default
      // But don't make it nullable if it's already an anyOf/oneOf that includes null
      if (propJsonSchema.default === null) {
        const hasAnyOfWithNull =
          propJsonSchema.anyOf &&
          Array.isArray(propJsonSchema.anyOf) &&
          propJsonSchema.anyOf.some(
            (schema: JsonSchema) =>
              typeof schema === 'object' && schema !== null && schema.type === 'null'
          );
        const hasOneOfWithNull =
          propJsonSchema.oneOf &&
          Array.isArray(propJsonSchema.oneOf) &&
          propJsonSchema.oneOf.some(
            (schema: JsonSchema) =>
              typeof schema === 'object' && schema !== null && schema.type === 'null'
          );
        const isNullable =
          'nullable' in propJsonSchema &&
          (propJsonSchema as JsonSchemaObject & { nullable?: boolean }).nullable === true;

        if (hasAnyOfWithNull || hasOneOfWithNull || isNullable) {
          // The schema already handles null through anyOf/oneOf/nullable, just make it optional with default
          properties[key] = propZodSchema.optional().default(null);
        } else {
          // Make the field nullable with the null default
          properties[key] = propZodSchema.nullable().optional().default(null);
        }
      } else {
        properties[key] = propZodSchema.optional().default(propJsonSchema.default);
      }
    } else {
      properties[key] = required ? propZodSchema : propZodSchema.optional();
    }
  }

  return z.object(properties);
}

/**
 * Object parser for schemas carrying `patternProperties`.
 *
 * Every key is routed to exactly the schemas that apply to it — each matching
 * pattern, and `additionalProperties` only when no pattern and no named
 * property claims the key. A catch-all union would instead let a key sneak past
 * its own pattern by satisfying an unrelated one.
 */
function parseDynamicKeyObject(
  normalizedSchema: JsonSchemaObject & { type?: 'object' },
  propertiesSchema: z.ZodObject<Record<string, z.ZodTypeAny>, 'strip', z.ZodTypeAny> | undefined,
  additionalProperties: z.ZodTypeAny | undefined,
  refs: Refs
): z.ZodTypeAny {
  const patterns = Object.entries(normalizedSchema.patternProperties ?? {}).map(
    ([pattern, schema]) => ({
      regex: new RegExp(pattern),
      parser: parseSchema(schema, {
        ...refs,
        path: [...refs.path, 'patternProperties', pattern],
      }),
    })
  );

  const declaredKeys = new Set(Object.keys(normalizedSchema.properties ?? {}));
  const rejectsUnmatched =
    additionalProperties instanceof z.ZodNever ||
    (additionalProperties === undefined && declaredKeys.size > 0);
  const validatesUnmatched =
    additionalProperties !== undefined &&
    !(additionalProperties instanceof z.ZodNever) &&
    normalizedSchema.additionalProperties !== true;

  const base = (propertiesSchema ?? z.object({})).passthrough();

  return base.transform((value: Record<string, unknown>, ctx) => {
    const result: Record<string, unknown> = { ...value };
    const unrecognizedKeys: string[] = [];

    for (const key of Object.keys(value)) {
      const matching = patterns.filter(({ regex }) => regex.test(key));

      for (const { parser } of matching) {
        const parsed = parser.safeParse(value[key]);
        if (!parsed.success) {
          ctx.addIssue({
            path: [...ctx.path, key],
            code: 'custom',
            message: `Invalid input: key "${key}" must match its patternProperties schema`,
            params: { issues: parsed.error.issues },
          });
        } else if (!declaredKeys.has(key)) {
          result[key] = parsed.data;
        }
      }

      if (matching.length > 0 || declaredKeys.has(key)) {
        continue;
      }

      if (rejectsUnmatched) {
        unrecognizedKeys.push(key);
      } else if (validatesUnmatched) {
        const parsed = additionalProperties!.safeParse(value[key]);
        if (!parsed.success) {
          ctx.addIssue({
            path: [...ctx.path, key],
            code: 'custom',
            message: `Invalid input: key "${key}" must match the additionalProperties schema`,
            params: { issues: parsed.error.issues },
          });
        } else {
          result[key] = parsed.data;
        }
      }
    }

    if (unrecognizedKeys.length > 0) {
      ctx.addIssue({
        path: [...ctx.path],
        code: 'unrecognized_keys',
        keys: unrecognizedKeys,
        message: `Unrecognized key(s) in object: ${unrecognizedKeys.map(key => `'${key}'`).join(', ')}`,
      });
    }

    return result;
  });
}

export function parseObject(
  objectSchema: JsonSchemaObject & { type?: 'object' },
  refs: Refs
): z.ZodTypeAny {
  const hasPatternProperties = Object.keys(objectSchema.patternProperties ?? {}).length > 0;

  // Ensure type is set to 'object' if not already
  const normalizedSchema =
    objectSchema.type === 'object' ? objectSchema : { ...objectSchema, type: 'object' as const };

  const propertiesSchema:
    z.ZodObject<Record<string, z.ZodTypeAny>, 'strip', z.ZodTypeAny> | undefined =
    parseObjectProperties(normalizedSchema, refs);

  const additionalProperties =
    normalizedSchema.additionalProperties !== undefined
      ? parseSchema(normalizedSchema.additionalProperties, {
          ...refs,
          path: [...refs.path, 'additionalProperties'],
        })
      : undefined;

  // Track if additionalProperties was explicitly set to true
  const isAdditionalPropertiesTrue = normalizedSchema.additionalProperties === true;

  let output: z.ZodTypeAny;
  if (hasPatternProperties) {
    output = parseDynamicKeyObject(normalizedSchema, propertiesSchema, additionalProperties, refs);
  } else if (propertiesSchema) {
    if (additionalProperties) {
      if (additionalProperties instanceof z.ZodNever) {
        output = propertiesSchema.strict();
      } else if (isAdditionalPropertiesTrue) {
        // When additionalProperties was explicitly true, use passthrough
        output = propertiesSchema.passthrough();
      } else {
        output = propertiesSchema.catchall(additionalProperties);
      }
    } else {
      // Named properties with an omitted `additionalProperties` stay strict for
      // tool inputs, even though JSON Schema itself would allow unknown keys.
      output = propertiesSchema.strict();
    }
  } else {
    if (additionalProperties) {
      if (additionalProperties instanceof z.ZodNever) {
        // When additionalProperties is false, create strict empty object
        output = z.object({}).strict();
      } else if (isAdditionalPropertiesTrue) {
        // When additionalProperties was explicitly true, use empty object with passthrough
        output = z.object({}).passthrough();
      } else {
        output = z.record(additionalProperties);
      }
    } else {
      // A property-less object with no `additionalProperties` keyword is open:
      // arbitrary content is accepted and preserved verbatim.
      output = z.object({}).passthrough();
    }
  }

  if (its.an.anyOf(objectSchema)) {
    output = output.and(
      parseAnyOf(
        {
          ...objectSchema,
          anyOf: objectSchema.anyOf.map(x =>
            typeof x === 'object' &&
            !x.type &&
            (x.properties ?? x.additionalProperties ?? x.patternProperties)
              ? { ...x, type: 'object' }
              : x
          ),
        },
        refs
      )
    );
  }

  if (its.a.oneOf(objectSchema)) {
    output = output.and(
      parseOneOf(
        {
          ...objectSchema,
          oneOf: objectSchema.oneOf.map(x =>
            typeof x === 'object' &&
            !x.type &&
            (x.properties ?? x.additionalProperties ?? x.patternProperties)
              ? { ...x, type: 'object' }
              : x
          ),
        },
        refs
      )
    );
  }

  if (its.an.allOf(objectSchema)) {
    output = output.and(
      parseAllOf(
        {
          ...objectSchema,
          allOf: objectSchema.allOf.map(x =>
            typeof x === 'object' &&
            !x.type &&
            (x.properties ?? x.additionalProperties ?? x.patternProperties)
              ? { ...x, type: 'object' }
              : x
          ),
        },
        refs
      )
    );
  }

  return output;
}
