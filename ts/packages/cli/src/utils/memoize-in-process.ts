import { Deferred, Effect, Exit } from 'effect';

/**
 * Memoizes an Effect per key for the lifetime of the process, sharing one run
 * between concurrent callers. A success stays cached; a failure or defect is
 * delivered to the callers already waiting and then dropped so the next caller
 * retries instead of replaying it.
 *
 * The run is owned by a detached fiber rather than by whichever caller arrived
 * first. Interrupting a caller therefore cancels only that caller's wait: the
 * run completes and every other waiter still receives its result. With
 * `Effect.cached` the first caller owns the run, so interrupting it would store
 * the interrupt and replay it to every fiber already parked on the cell.
 *
 * Meant for reads that cannot change within one CLI invocation (a tool's
 * latest version, the user's connected accounts) but were being fetched more
 * than once by independent code paths on the same command.
 */
export const memoizeInProcess = <I, A, E, R>(options: {
  readonly keyOf: (input: I) => string;
  readonly make: (input: I) => Effect.Effect<A, E, R>;
}): ((input: I) => Effect.Effect<A, E, R>) => {
  const cache = new Map<string, Deferred.Deferred<A, E>>();

  const load = (input: I): Effect.Effect<A, E, R> =>
    // The lookup, the insert, and the fork run without an interruption point
    // between them, so a cell is never left in the map without an owner.
    Effect.uninterruptible(
      Effect.suspend(() => {
        const key = options.keyOf(input);
        const existing = cache.get(key);
        if (existing) {
          return Effect.succeed(existing);
        }

        const cell = Deferred.makeUnsafe<A, E>();
        cache.set(key, cell);
        return options.make(input).pipe(
          Effect.exit,
          Effect.flatMap(exit => {
            if (!Exit.isSuccess(exit) && cache.get(key) === cell) {
              cache.delete(key);
            }
            return Deferred.done(cell, exit);
          }),
          Effect.forkDetach,
          Effect.as(cell)
        );
      })
    ).pipe(Effect.flatMap(cell => Deferred.await(cell)));

  return load;
};
