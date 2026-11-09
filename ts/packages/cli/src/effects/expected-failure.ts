import { Predicate } from 'effect';

/**
 * Marks an error class as an expected failure: the user fixes it by changing the invocation or
 * their setup, or a remote service reported it clearly. the invocation (`src/invocation/invocation.ts`) prints its `message` on
 * stderr and exits 1, with no defect banner. Anything unmarked is a defect.
 *
 * An error class opts in where it is defined, with a getter, so no central list needs updating:
 *
 * @example
 * ```ts
 * class MissingThingError extends Data.TaggedError('commands/MissingThingError')<{
 *   readonly message: string;
 * }> {
 *   get [ExpectedFailure]() {
 *     return true;
 *   }
 * }
 * ```
 *
 * A getter, rather than an instance field, stays off the instance's own properties, so it does
 * not change structural equality or serialization, and it can depend on a field, e.g. only one
 * `reason` is expected.
 */
export const ExpectedFailure: unique symbol = Symbol.for('@composio/cli/ExpectedFailure');

/** An error the invocation prints as its message alone. */
export interface ExpectedFailure {
  readonly [ExpectedFailure]: boolean;
  readonly message: string;
}

export const isExpectedFailure = (error: unknown): error is ExpectedFailure =>
  Predicate.hasProperty(error, ExpectedFailure) &&
  error[ExpectedFailure] === true &&
  Predicate.hasProperty(error, 'message') &&
  Predicate.isString(error.message);
