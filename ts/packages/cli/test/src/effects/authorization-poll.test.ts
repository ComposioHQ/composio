import { describe, expect, it } from '@effect/vitest';
import { Clock, Effect, Exit, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import {
  AUTHORIZATION_POLL_INTERVAL_SECONDS,
  AUTHORIZATION_TIMEOUT_MINUTES,
  authorizationPollSchedule,
} from 'src/effects/authorization-poll';

/** The test-clock times of every check of an authorization that never completes. */
const checksOfAPendingAuthorization = Effect.gen(function* () {
  const checkedAt: number[] = [];
  const check = Effect.flatMap(Clock.currentTimeMillis, now => {
    checkedAt.push(now);
    return Effect.fail('still pending' as const);
  });
  const fiber = yield* Effect.forkChild(
    Effect.exit(Effect.retry(check, authorizationPollSchedule))
  );
  // Moves the clock in 100ms steps for as long as the retry runs; it ends by itself.
  const pump = yield* Effect.forkChild(
    Effect.forever(Effect.andThen(Effect.yieldNow, () => TestClock.adjust('100 millis')))
  );
  const exit = yield* Fiber.join(fiber);
  yield* Fiber.interrupt(pump);
  return { exit, checkedAt };
});

describe('authorizationPollSchedule', () => {
  it.effect('ramps from 0.3s and never waits longer than the interval between checks', () =>
    Effect.gen(function* () {
      const { checkedAt } = yield* checksOfAPendingAuthorization;
      const gaps = checkedAt.slice(1).map((time, index) => time - checkedAt[index]!);

      expect(gaps.slice(0, 6)).toEqual([300, 600, 1200, 2400, 4800, 5000]);
      expect(Math.max(...gaps)).toBe(AUTHORIZATION_POLL_INTERVAL_SECONDS * 1000);
    })
  );

  it.effect('gives up once the timeout has passed, not hours later', () =>
    Effect.gen(function* () {
      const { exit, checkedAt } = yield* checksOfAPendingAuthorization;
      const timeoutMs = AUTHORIZATION_TIMEOUT_MINUTES * 60_000;

      expect(Exit.isFailure(exit)).toBe(true);
      expect(checkedAt.at(-1)).toBeGreaterThan(timeoutMs - 5_000);
      expect(checkedAt.at(-1)).toBeLessThanOrEqual(timeoutMs + 5_000);
    })
  );
});
