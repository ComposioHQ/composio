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
import { ZodType, ZodTypeAny, z } from 'zod';
import { ValidationError } from '../errors';

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
            throw new ValidationError(
              `Failed to transform${options?.label ? ` ${options.label}` : ''}`,
              {
                cause: result.error,
              }
            );
          }

          return result.data;
        },
      };
    },
  };
}
