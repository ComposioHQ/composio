/** Type-level tuple of length `N`, used for arithmetic. */
type BuildTuple<N extends number, T extends unknown[] = []> = T['length'] extends N
  ? T
  : BuildTuple<N, [...T, unknown]>;

/** Type-level `A - B`, clamped to `0`. */
type Subtract<A extends number, B extends number> =
  BuildTuple<A> extends [...BuildTuple<B>, ...infer Rest] ? Rest['length'] : 0;

/** Type-level `str.slice(0, N)`: first `N` characters of `S`. */
type Take<S extends string, N extends number, Acc extends unknown[] = []> = Acc['length'] extends N
  ? ''
  : S extends `${infer First}${infer Rest}`
    ? `${First}${Take<Rest, N, [...Acc, unknown]>}`
    : '';

/** Type-level result of truncating `S` to max `N` characters with `"..."` suffix. */
type Truncated<S extends string, N extends number> = `${Take<S, Subtract<N, 3>>}...`;

/** If `S` fits in `N` chars, return `S`; otherwise return the precise truncated literal. */
type TruncateResult<S extends string, N extends number> =
  S extends Take<S, N> ? S : Truncated<S, N>;

/**
 * Truncate a string to the given max length, appending "..." if truncated.
 */
export function truncate<const S extends string, const N extends number>(
  str: S,
  max: N
): TruncateResult<S, N> {
  if (str.length <= max) return str as TruncateResult<S, N>;
  return `${str.slice(0, max - 3)}...` as TruncateResult<S, N>;
}
