import { z, z3, type ZodTypeAny } from '../zod-compat';

import { parseAllOf } from './parse-all-of';
import { parseAnyOf } from './parse-any-of';
import { parseOneOf } from './parse-one-of';
import { parseSchema } from './parse-schema';
import type { JsonSchemaObject, Refs, JsonSchema } from '../types';
import { its } from '../utils/its';

function parseObjectProperties(objectSchema: JsonSchemaObject & { type?: 'object' }, refs: Refs) {
  if (!objectSchema.properties) {
    // leave it as an empty object or else this will break openai responses
    return z.object({});
  }

  const propertyKeys = Object.keys(objectSchema.properties);
  if (propertyKeys.length === 0) {
    return z.object({});
  }

  const properties: Record<string, ZodTypeAny> = {};

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
          properties[key] = (propZodSchema as z3.ZodTypeAny).optional().default(null) as ZodTypeAny;
        } else {
          // Make the field nullable with the null default
          properties[key] = (propZodSchema as z3.ZodTypeAny)
            .nullable()
            .optional()
            .default(null) as ZodTypeAny;
        }
      } else {
        properties[key] = (propZodSchema as z3.ZodTypeAny)
          .optional()
          .default(propJsonSchema.default) as ZodTypeAny;
      }
    } else {
      properties[key] = required
        ? propZodSchema
        : ((propZodSchema as z3.ZodTypeAny).optional() as ZodTypeAny);
    }
  }

  return z.object(properties as unknown as z3.ZodRawShape);
}

export function parseObject(
  objectSchema: JsonSchemaObject & { type?: 'object' },
  refs: Refs
): ZodTypeAny {
  const hasPatternProperties = Object.keys(objectSchema.patternProperties ?? {}).length > 0;

  // Ensure type is set to 'object' if not already
  const normalizedSchema =
    objectSchema.type === 'object' ? objectSchema : { ...objectSchema, type: 'object' as const };

  const propertiesSchema:
    | z3.ZodObject<Record<string, z3.ZodTypeAny>, 'strip', z3.ZodTypeAny>
    | undefined = parseObjectProperties(normalizedSchema, refs) as
    | z3.ZodObject<Record<string, z3.ZodTypeAny>, 'strip', z3.ZodTypeAny>
    | undefined;
  let zodSchema: ZodTypeAny | undefined = propertiesSchema;

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
          z.union([...patternPropertyValues, additionalProperties] as unknown as [
            z3.ZodTypeAny,
            z3.ZodTypeAny,
            ...z3.ZodTypeAny[],
          ])
        ) as ZodTypeAny;
      } else if (Object.keys(parsedPatternProperties).length > 1) {
        zodSchema = propertiesSchema.catchall(
          z.union(
            patternPropertyValues as unknown as [z3.ZodTypeAny, z3.ZodTypeAny, ...z3.ZodTypeAny[]]
          )
        ) as ZodTypeAny;
      } else {
        zodSchema = propertiesSchema.catchall(
          patternPropertyValues[0] as z3.ZodTypeAny
        ) as ZodTypeAny;
      }
    } else {
      if (additionalProperties) {
        zodSchema = z.record(
          z.union([...patternPropertyValues, additionalProperties] as unknown as [
            z3.ZodTypeAny,
            z3.ZodTypeAny,
            ...z3.ZodTypeAny[],
          ])
        ) as ZodTypeAny;
      } else if (patternPropertyValues.length > 1) {
        zodSchema = z.record(
          z.union(
            patternPropertyValues as unknown as [z3.ZodTypeAny, z3.ZodTypeAny, ...z3.ZodTypeAny[]]
          )
        ) as ZodTypeAny;
      } else {
        zodSchema = z.record(patternPropertyValues[0] as z3.ZodTypeAny) as ZodTypeAny;
      }
    }

    const objectPropertyKeys = new Set(Object.keys(normalizedSchema.properties ?? {}));
    zodSchema = (zodSchema as z3.ZodTypeAny).superRefine(
      (value: Record<string, unknown>, ctx: z3.RefinementCtx) => {
        for (const key in value) {
          let wasMatched = objectPropertyKeys.has(key);

          for (const patternPropertyKey in normalizedSchema.patternProperties) {
            const regex = new RegExp(patternPropertyKey);
            if (key.match(regex)) {
              wasMatched = true;
              const result = (
                parsedPatternProperties[patternPropertyKey] as z3.ZodTypeAny
              ).safeParse(value[key]);
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
            const result = (additionalProperties as z3.ZodTypeAny).safeParse(value[key]);
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
      }
    );
  }
  let output: ZodTypeAny;
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
        output = propertiesSchema.catchall(additionalProperties as z3.ZodTypeAny) as ZodTypeAny;
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
        output = z.record(additionalProperties as z3.ZodTypeAny) as ZodTypeAny;
      }
    } else {
      // When no properties and no additionalProperties specified, default to allowing additional properties
      output = z.object({}).passthrough();
    }
  }

  if (its.an.anyOf(objectSchema)) {
    output = (output as z3.ZodTypeAny).and(
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
      ) as z3.ZodTypeAny
    ) as ZodTypeAny;
  }

  if (its.a.oneOf(objectSchema)) {
    output = (output as z3.ZodTypeAny).and(
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
      ) as z3.ZodTypeAny
    ) as ZodTypeAny;
  }

  if (its.an.allOf(objectSchema)) {
    output = (output as z3.ZodTypeAny).and(
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
      ) as z3.ZodTypeAny
    ) as ZodTypeAny;
  }

  return output;
}
