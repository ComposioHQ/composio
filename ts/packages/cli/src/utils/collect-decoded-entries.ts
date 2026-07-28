import { Option } from 'effect';

/**
 * Decode a record's entries one by one, keeping only the entries that decode
 * successfully. Used for tolerant cache-file reads: one stale or
 * version-skewed entry drops only itself instead of discarding the whole
 * file (which would also be persisted back on the next write, permanently
 * destroying the good entries).
 */
export const collectDecodedEntries = <A>(
  entries: Readonly<Record<string, unknown>> | undefined,
  decode: (value: unknown) => Option.Option<A>
): Record<string, A> =>
  Object.fromEntries(
    Object.entries(entries ?? {}).flatMap(([key, value]) =>
      Option.match(decode(value), {
        onNone: () => [],
        onSome: entry => [[key, entry] as const],
      })
    )
  );
