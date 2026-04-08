import { Effect, Option } from 'effect';

/**
 * Run an effect with a timeout. Returns `Option.some(result)` on success
 * or `Option.none()` on timeout/error. Logs debug messages for observability.
 */
export const getOptionalResultWithTimeout = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timeoutMs: number,
  timeoutMessage: string,
  failureMessage: string
): Effect.Effect<Option.Option<A>, never, R> =>
  Effect.raceFirst(
    Effect.disconnect(
      effect.pipe(
        Effect.asSome,
        Effect.catchAll(error =>
          Effect.logDebug(failureMessage, error).pipe(Effect.as(Option.none<A>()))
        )
      )
    ),
    Effect.disconnect(
      Effect.sleep(timeoutMs).pipe(
        Effect.zipRight(Effect.logDebug(timeoutMessage)),
        Effect.as(Option.none<A>())
      )
    )
  );

/**
 * Like `getOptionalResultWithTimeout` but unwraps to `A | undefined`.
 */
export const getOptionalValueWithTimeout = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timeoutMs: number,
  timeoutMessage: string,
  failureMessage: string
): Effect.Effect<A | undefined, never, R> =>
  getOptionalResultWithTimeout(effect, timeoutMs, timeoutMessage, failureMessage).pipe(
    Effect.map(Option.getOrUndefined)
  );
