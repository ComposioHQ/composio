/**
 * Function to transform the response from the API to the expected format
 * This takes in the zod schema to be transformed into and the response from the API
 *
 * Users need to manually map the fields to the expected format
 *
 * @example
 * ```ts
 * transform(response)
 *   .with(ConnectedAccountRetrieveResponseSchema)
 *   .using((raw) => ({ ... }))
 * ```
 */
import { ZodTypeAny, z } from 'zod/v3';
import { logger } from '..';

export function transform<RawInput>(raw: RawInput) {
  return {
    with<Schema extends ZodTypeAny>(schema: Schema) {
      return {
        using(
          transformer: (input: RawInput) => z.infer<Schema>,
          options?: { label?: string }
        ): z.infer<Schema> {
          const transformed = transformer(raw);
          const result = schema.safeParse(transformed);

          if (!result.success) {
            const label = options?.label ? ` for ${options.label}` : '';
            const issues = result.error.issues
              .map(issue => `  - ${issue.path.join('.') || 'parameter'}: ${issue.message}`)
              .join('\n');
            logger.warn(`Transform validation failed${label}:\n${issues}`);
            return transformed;
          }

          return result.data;
        },
      };
    },
  };
}
