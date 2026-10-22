import { z } from 'zod/v3';
import { ValidationError } from '../errors/ValidationErrors';

const SESSION_CONFIG_CONFLICT_MARKER = 'sessionConfigConflict';

/**
 * Adds the issue raised when a saved Session config (`experimental.sessionConfigId`)
 * is combined with inline access fields. `fields` lists every conflicting
 * field that was provided; nothing is added when it is empty.
 */
export const addSessionConfigConflictIssue = (ctx: z.RefinementCtx, fields: string[]): void => {
  if (fields.length === 0) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `experimental.sessionConfigId cannot be combined with ${fields.join(', ')}. A saved Session config sets the session's toolkit, tool and tag access; remove ${fields.length === 1 ? 'that field' : 'those fields'} or sessionConfigId`,
    path: ['experimental', 'sessionConfigId'],
    params: { [SESSION_CONFIG_CONFLICT_MARKER]: true },
  });
};

/**
 * Parses session create or update input. A saved Session config combined with
 * inline access fields throws `ValidationError`; any other failure rethrows the
 * original `ZodError`, as `schema.parse()` would.
 */
export const parseSessionConfigInput = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown
): z.output<TSchema> => {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const isConflict = result.error.issues.some(
    issue => issue.code === z.ZodIssueCode.custom && issue.params?.[SESSION_CONFIG_CONFLICT_MARKER]
  );
  if (isConflict) {
    throw new ValidationError('Invalid session config', { cause: result.error });
  }
  throw result.error;
};
