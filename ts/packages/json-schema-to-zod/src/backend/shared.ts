import type { ObjectPolicy, RunFailure, RunResult, WholeSchemaGuard } from './types';

/** An object schema the object policies can be applied to. */
type PolicyBase<S> = S & {
  strict(): S;
  passthrough(): S;
  catchall(schema: S): S;
};

/** Anything with the zod parse surface the shared runner needs. */
type SafeParseLike = {
  safeParse(
    value: unknown
  ):
    | { success: true; data: unknown }
    | { success: false; error: { issues: ReadonlyArray<unknown> } };
};

/** Spreads an optional relative issue path into an issue body. */
export const withPath = (path: ReadonlyArray<string | number> | undefined) =>
  path === undefined ? {} : { path: [...path] };

/** Runs `guard` first and falls back to the guard already on the schema. */
export const composeGuards = (
  guard: WholeSchemaGuard,
  inner: WholeSchemaGuard | undefined
): WholeSchemaGuard => (inner ? value => guard(value) ?? inner(value) : guard);

/** Runs the schema; the failure carries the backend's own error with its issues. */
export const run = (schema: SafeParseLike, value: unknown): RunResult => {
  const result = schema.safeParse(value);
  const { success } = result;
  return success
    ? { success, data: result.data }
    : { success, failure: result.error as RunFailure };
};

/** Applies one of the object policies the parsers use to a built object schema. */
export const applyObjectPolicy = <S>(base: PolicyBase<S>, policy: ObjectPolicy<S>): S => {
  switch (policy.kind) {
    case 'strict':
      return base.strict();
    case 'loose':
      return base.passthrough();
    case 'catchall':
      return base.catchall(policy.schema);
  }
};

/** Attaches the rest schema to a tuple when the schema declares one. */
export const buildTuple = <S>(tuple: S & { rest(schema: S): S }, rest: S | undefined): S =>
  rest === undefined ? tuple : tuple.rest(rest);

/** RFC 3339 `partial-time` with an optional `time-offset`, which zod's `time()` rejects. */
export const RFC3339_TIME =
  /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?([Zz]|[+-]([01]\d|2[0-3]):[0-5]\d)?)?$/;
