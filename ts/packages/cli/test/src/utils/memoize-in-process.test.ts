import { describe, expect, it } from '@effect/vitest';
import { Cause, Deferred, Effect, Fiber } from 'effect';
import { clearInProcessMemos, memoizeInProcess } from 'src/utils/memoize-in-process';

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
      const outcomes = [Effect.fail(new Error('first call fails')), Effect.succeed(2)];
      const load = memoizeInProcess({
        keyOf: (key: string) => key,
        make: () => Effect.suspend(() => outcomes[calls++]),
      });

      const first = yield* Effect.flip(load('k'));
      expect(first).toEqual(new Error('first call fails'));

      expect(yield* load('k')).toBe(2);
      expect(yield* load('k')).toBe(2);
      expect(calls).toBe(2);
    })
  );

  it.effect('drops a defect so the next caller retries', () =>
    Effect.gen(function* () {
      let calls = 0;
      const outcomes = [Effect.die('first call dies'), Effect.succeed(2)];
      const load = memoizeInProcess({
        keyOf: (key: string) => key,
        make: () => Effect.suspend(() => outcomes[calls++]),
      });

      const first = yield* load('k').pipe(Effect.sandbox, Effect.flip);
      expect(Cause.squash(first)).toBe('first call dies');

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
      const outcomes = [Effect.fail(new Error('first call fails')), Effect.succeed(2)];
      const load = memoizeInProcess({
        keyOf: (key: string) => key,
        make: () =>
          Effect.gen(function* () {
            const outcome = outcomes[calls++];
            yield* Deferred.await(release);
            return yield* outcome;
          }),
      });

      const first = yield* Effect.forkChild(Effect.flip(load('k')));
      const second = yield* Effect.forkChild(Effect.flip(load('k')));
      yield* Effect.yieldNow;
      yield* Deferred.succeed(release, undefined);

      expect(yield* Fiber.join(first)).toEqual(new Error('first call fails'));
      expect(yield* Fiber.join(second)).toEqual(new Error('first call fails'));
      expect(yield* load('k')).toBe(2);
      expect(calls).toBe(2);
    })
  );

  it.effect('clear() forgets cached results, for every memo in the process', () =>
    Effect.gen(function* () {
      let calls = 0;
      const load = memoizeInProcess({
        keyOf: (key: string) => key,
        make: () => Effect.sync(() => ++calls),
      });
      const other = memoizeInProcess({
        keyOf: (key: string) => key,
        make: () => Effect.sync(() => ++calls),
      });

      expect(yield* load('k')).toBe(1);
      expect(yield* other('k')).toBe(2);
      load.clear();
      expect(yield* load('k')).toBe(3);
      expect(yield* other('k')).toBe(2);

      clearInProcessMemos();
      expect(yield* load('k')).toBe(4);
      expect(yield* other('k')).toBe(5);
    })
  );
});
