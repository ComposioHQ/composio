import { describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Exit, Fiber } from 'effect';
import { memoizeInProcess } from 'src/utils/memoize-in-process';

describe('memoizeInProcess', () => {
  it.effect('runs the effect once per key and shares the result', () =>
    Effect.gen(function* () {
      let calls = 0;
      const load = memoizeInProcess({
        keyOf: (key: string) => key,
        make: key => Effect.sync(() => `${key}:${++calls}`),
      });

      const [a, b, c] = yield* Effect.all([load('x'), load('x'), load('y')], {
        concurrency: 'unbounded',
      });

      expect(a).toBe('x:1');
      expect(b).toBe('x:1');
      expect(c).toBe('y:2');
      expect(calls).toBe(2);
    })
  );

  it.effect('drops a failure so the next caller retries', () =>
    Effect.gen(function* () {
      let calls = 0;
      const load = memoizeInProcess({
        keyOf: (key: string) => key,
        make: () =>
          Effect.suspend(() =>
            ++calls === 1 ? Effect.fail(new Error('first call fails')) : Effect.succeed(calls)
          ),
      });

      const first = yield* Effect.exit(load('k'));
      expect(Exit.isFailure(first)).toBe(true);

      expect(yield* load('k')).toBe(2);
      expect(yield* load('k')).toBe(2);
      expect(calls).toBe(2);
    })
  );

  it.effect('drops a defect so the next caller retries', () =>
    Effect.gen(function* () {
      let calls = 0;
      const load = memoizeInProcess({
        keyOf: (key: string) => key,
        make: () =>
          Effect.suspend(() =>
            ++calls === 1 ? Effect.die('first call dies') : Effect.succeed(calls)
          ),
      });

      const first = yield* Effect.exit(load('k'));
      expect(Exit.isFailure(first)).toBe(true);

      expect(yield* load('k')).toBe(2);
      expect(calls).toBe(2);
    })
  );

  it.effect('an interrupted caller does not take the shared run down with it', () =>
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>();
      let calls = 0;
      const load = memoizeInProcess({
        keyOf: (key: string) => key,
        make: () =>
          Effect.gen(function* () {
            calls += 1;
            yield* Deferred.await(release);
            return calls;
          }),
      });

      const first = yield* Effect.forkChild(load('k'));
      const second = yield* Effect.forkChild(load('k'));
      yield* Effect.yieldNow;

      yield* Fiber.interrupt(first);
      yield* Deferred.succeed(release, undefined);

      expect(yield* Fiber.join(second)).toBe(1);
      expect(yield* load('k')).toBe(1);
      expect(calls).toBe(1);
    })
  );

  it.effect('a failure reaches every caller already waiting, then is dropped', () =>
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>();
      let calls = 0;
      const load = memoizeInProcess({
        keyOf: (key: string) => key,
        make: () =>
          Effect.gen(function* () {
            calls += 1;
            yield* Deferred.await(release);
            if (calls === 1) return yield* Effect.fail(new Error('first call fails'));
            return calls;
          }),
      });

      const first = yield* Effect.forkChild(Effect.exit(load('k')));
      const second = yield* Effect.forkChild(Effect.exit(load('k')));
      yield* Effect.yieldNow;
      yield* Deferred.succeed(release, undefined);

      expect(Exit.isFailure(yield* Fiber.join(first))).toBe(true);
      expect(Exit.isFailure(yield* Fiber.join(second))).toBe(true);
      expect(yield* load('k')).toBe(2);
      expect(calls).toBe(2);
    })
  );
});
