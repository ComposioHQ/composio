import { Effect } from 'effect';

/**
 * Memoizes an Effect per key for the lifetime of the process, sharing one run
 * between concurrent callers. A success stays cached; a failure, defect, or
 * interruption is dropped so the next caller retries instead of replaying it.
 *
 * Meant for reads that cannot change within one CLI invocation (a tool's
 * latest version, the user's connected accounts) but were being fetched more
 * than once by independent code paths on the same command.
 */
export const memoizeInProcess = <I, A, E, R>(options: {
  readonly keyOf: (input: I) => string;
  readonly make: (input: I) => Effect.Effect<A, E, R>;
}): ((input: I) => Effect.Effect<A, E, R>) => {
  const cache = new Map<string, Effect.Effect<A, E, R>>();

  return input =>
    Effect.suspend(() => {
      const key = options.keyOf(input);
      const existing = cache.get(key);
      if (existing) {
        return existing;
      }

      // `Effect.cached` only allocates the memo cell; running it here is
      // synchronous, so the lookup and the insert cannot interleave with
      // another fiber.
      const cached = Effect.runSync(
        Effect.cached(
          options.make(input).pipe(Effect.onError(() => Effect.sync(() => cache.delete(key))))
        )
      );
      cache.set(key, cached);
      return cached;
    });
};
