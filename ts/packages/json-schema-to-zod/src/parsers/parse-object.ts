import * as z from 'zod/v3';

import { parseAllOf } from './parse-all-of';
import { parseAnyOf } from './parse-any-of';
import { parseObjectShape } from './parse-object-shape';
import { parseOneOf } from './parse-one-of';
import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs } from '../types';
import { its } from '../utils/its';

function parseObjectProperties(objectSchema: JsonSchemaObject & { type?: 'object' }, refs: Refs) {
  const properties = parseObjectShape(objectSchema, refs);
  return Object.keys(properties).length === 0 ? undefined : z.object(properties);
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
  let zodSchema: z.ZodTypeAny | undefined = propertiesSchema;

  const additionalProperties =
    normalizedSchema.additionalProperties !== undefined
      ? parseSchema(normalizedSchema.additionalProperties, {
          ...refs,
          path: [...refs.path, 'additionalProperties'],
        })
      : undefined;

  // Track if additionalProperties was explicitly set to true
  const isAdditionalPropertiesTrue = normalizedSchema.additionalProperties === true;

  if (normalizedSchema.patternProperties) {
    const parsedPatternProperties = Object.fromEntries(
      Object.entries(normalizedSchema.patternProperties).map(([key, value]) => {
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

    const objectPropertyKeys = new Set(Object.keys(normalizedSchema.properties ?? {}));
    zodSchema = zodSchema.superRefine((value: Record<string, unknown>, ctx) => {
      for (const key in value) {
        let wasMatched = objectPropertyKeys.has(key);

        for (const patternPropertyKey in normalizedSchema.patternProperties) {
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
        output = propertiesSchema.catchall(additionalProperties);
      }
    } else {
      // When additionalProperties is not specified, treat it as false
      output = propertiesSchema.strict();
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
