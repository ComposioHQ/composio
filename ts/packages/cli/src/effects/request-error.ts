import { Data, Effect, type Cause } from 'effect';

type RequestErrorFields = {
  readonly message: string;
  readonly cause: unknown;
};

/**
 * Base class for a command's failure around a client request: the command's
 * own message, with the client's error kept in `cause`, which the top-level
 * printer renders as `Caused by:`.
 *
 * @example
 * ```ts
 * class ToolLogsRequestError extends requestError('commands/ToolLogsRequestError') {}
 * ```
 */
export const requestError = <Tag extends string>(
  tag: Tag
): new (
  fields: RequestErrorFields
) => Cause.YieldableError & { readonly _tag: Tag } & RequestErrorFields =>
  Data.TaggedError(tag)<RequestErrorFields>;

/**
 * Replaces any failure of an effect with `RequestError` carrying `message`,
 * keeping the original failure as its cause.
 *
 * @example
 * ```ts
 * client.logs.createToolExecution(body, idempotent).pipe(failedWith(ToolLogsRequestError, 'Failed to fetch tool logs.'))
 * ```
 */
export const failedWith =
  <E>(RequestError: new (fields: RequestErrorFields) => E, message: string) =>
  <A, R>(self: Effect.Effect<A, unknown, R>): Effect.Effect<A, E, R> =>
    Effect.mapError(self, cause => new RequestError({ message, cause }));
