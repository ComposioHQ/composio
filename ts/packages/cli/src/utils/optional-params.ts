import { Array as Arr, Option, Record as EffectRecord } from 'effect';

/**
 * The request parameters a record of optional flags turns into: each present
 * flag keeps its value and each absent one becomes `undefined`, which the client
 * leaves out of the query string.
 */
export type OptionalParams<R extends Readonly<Record<string, Option.Option<unknown>>>> = {
  readonly [K in keyof R]: R[K] extends Option.Option<infer A> ? A | undefined : never;
};

/**
 * Turns optional flags into request parameters in one place, instead of an
 * `Option.getOrUndefined` per field at the call site.
 *
 * @example
 * client._internal.logs.triggers.list({ ...optionalParams({ cursor, from, to }), limit })
 */
export const optionalParams = <const R extends Readonly<Record<string, Option.Option<unknown>>>>(
  flags: R
): OptionalParams<R> => EffectRecord.map(flags, Option.getOrUndefined) as OptionalParams<R>;

/**
 * The request parameter a list of filters turns into: the list when it has
 * elements and `undefined` when it is empty, so an unused filter is left out of
 * the request instead of being sent as `[]`.
 */
export const nonEmptyOrUndefined = <const T extends ReadonlyArray<unknown>>(
  values: T
): T | undefined => (Arr.isReadonlyArrayNonEmpty(values) ? values : undefined);
