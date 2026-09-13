import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';
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
});
