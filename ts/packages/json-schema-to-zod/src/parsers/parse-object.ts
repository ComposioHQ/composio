import * as z from 'zod';

import { parseAllOf } from './parse-all-of';
import { parseAnyOf } from './parse-any-of';
import { parseOneOf } from './parse-one-of';
import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs, JsonSchema } from '../types';
import { its } from '../utils/its';

function parseObjectProperties(objectSchema: JsonSchemaObject & { type: 'object' }, refs: Refs) {
  if (!objectSchema.properties) {
    return undefined;
  }

  const propertyKeys = Object.keys(objectSchema.properties);
  if (propertyKeys.length === 0) {
    return z.object({});
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

export function parseObject(
  objectSchema: JsonSchemaObject & { type: 'object' },
  refs: Refs
): z.ZodTypeAny {
  const hasPatternProperties = Object.keys(objectSchema.patternProperties ?? {}).length > 0;

  const propertiesSchema:
    | z.ZodObject<Record<string, z.ZodTypeAny>, 'strip', z.ZodTypeAny>
    | undefined = parseObjectProperties(objectSchema, refs);
  let zodSchema: z.ZodTypeAny | undefined = propertiesSchema;

  const additionalProperties =
    objectSchema.additionalProperties !== undefined
      ? parseSchema(objectSchema.additionalProperties, {
          ...refs,
          path: [...refs.path, 'additionalProperties'],
        })
      : undefined;

  // Track if additionalProperties was explicitly set to true
  const isAdditionalPropertiesTrue = objectSchema.additionalProperties === true;

  if (objectSchema.patternProperties) {
    const parsedPatternProperties = Object.fromEntries(
      Object.entries(objectSchema.patternProperties).map(([key, value]) => {
        return [
          key,
          parseSchema(value, {
            ...refs,
            path: [...refs.path, 'patternProperties', key],
          }),
        ];
      })
    );
    const patternPropertyValues = Object.values(parsedPatternProperties);

    if (propertiesSchema) {
      if (additionalProperties) {
        zodSchema = propertiesSchema.catchall(
          z.union([...patternPropertyValues, additionalProperties] as [z.ZodTypeAny, z.ZodTypeAny])
        );
      } else if (Object.keys(parsedPatternProperties).length > 1) {
        zodSchema = propertiesSchema.catchall(
          z.union(patternPropertyValues as [z.ZodTypeAny, z.ZodTypeAny])
        );
      } else {
        zodSchema = propertiesSchema.catchall(patternPropertyValues[0]);
      }
    } else {
      if (additionalProperties) {
        zodSchema = z.record(
          z.union([...patternPropertyValues, additionalProperties] as [z.ZodTypeAny, z.ZodTypeAny])
        );
      } else if (patternPropertyValues.length > 1) {
        zodSchema = z.record(z.union(patternPropertyValues as [z.ZodTypeAny, z.ZodTypeAny]));
      } else {
        zodSchema = z.record(patternPropertyValues[0]);
      }
    }

    const objectPropertyKeys = new Set(Object.keys(objectSchema.properties ?? {}));
    zodSchema = zodSchema.superRefine((value: Record<string, unknown>, ctx) => {
      for (const key in value) {
        let wasMatched = objectPropertyKeys.has(key);

        for (const patternPropertyKey in objectSchema.patternProperties) {
          const regex = new RegExp(patternPropertyKey);
          if (key.match(regex)) {
            wasMatched = true;
            const result = parsedPatternProperties[patternPropertyKey].safeParse(value[key]);
            if (!result.success) {
              ctx.addIssue({
                path: [...ctx.path, key],
                code: 'custom',
                message: `Invalid input: Key matching regex /${key}/ must match schema`,
                params: {
                  issues: result.error.issues,
                },
              });
            }
          }
        }

        if (!wasMatched && additionalProperties) {
          const result = additionalProperties.safeParse(value[key]);
          if (!result.success) {
            ctx.addIssue({
              path: [...ctx.path, key],
              code: 'custom',
              message: 'Invalid input: must match catchall schema',
              params: {
                issues: result.error.issues,
              },
            });
          }
        }
      }
    });
  }
  let output: z.ZodTypeAny;
  if (propertiesSchema) {
    if (hasPatternProperties) {
      output = zodSchema!;
    } else if (additionalProperties) {
      if (additionalProperties instanceof z.ZodNever) {
        output = propertiesSchema.strict();
      } else if (isAdditionalPropertiesTrue) {
        // When additionalProperties was explicitly true, use passthrough
        output = propertiesSchema.passthrough();
      } else {
        // Check if propertiesSchema is an empty object
        const isEmptyObject = Object.keys(propertiesSchema._def.shape()).length === 0;
        if (isEmptyObject) {
          output = propertiesSchema.passthrough();
        } else {
          output = propertiesSchema.catchall(additionalProperties);
        }
      }
    } else {
      // When additionalProperties is not specified, treat it as true
      output = propertiesSchema.passthrough();
    }
  } else {
    if (hasPatternProperties) {
      output = zodSchema!;
    } else if (additionalProperties) {
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
      // When no properties and no additionalProperties specified, default to allowing additional properties
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
