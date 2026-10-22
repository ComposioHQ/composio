import { describe, expect, it } from '@effect/vitest';
import { Cause, Data, Effect, Option } from 'effect';
import { extractSpanStackFrames } from 'src/effect-errors/logic/errors/span-annotation';

class CanaryError extends Data.TaggedError('CanaryError')<{
  readonly message: string;
}> {}

const findFailReason = <E>(cause: Cause.Cause<E>): Cause.Reason<E> =>
  Option.getOrThrowWith(
    Option.fromUndefinedOr(cause.reasons.find(Cause.isFailReason)),
    () => new Error('expected a fail reason')
  );

const findDieReason = <E>(cause: Cause.Cause<E>): Cause.Reason<E> =>
  Option.getOrThrowWith(
    Option.fromUndefinedOr(cause.reasons.find(Cause.isDieReason)),
    () => new Error('expected a die reason')
  );

describe('extractSpanStackFrames', () => {
  // v4 dropped the `effect/SpanAnnotation` internal that let `Effect.fail`/`Effect.die`
  // stamp the ambient span directly onto the raised error value. The analogous v4
  // mechanism lives one level up, on the `Cause` `Reason`: `Effect.withSpan` pushes a
  // span-named `StackFrame` onto the `CurrentStackFrame` fiber reference, and on
  // failure the runtime annotates every reason with that frame chain under the
  // `Cause.StackTrace` context key (confirmed against `ts/vendor/effect` —
  // `internal/effect.ts`'s `provideSpanStackFrame` / `internal/core.ts`'s
  // `exitFailCause`, public accessor `Cause.StackTrace`, readable via
  // `Context.get(Cause.reasonAnnotations(reason), Cause.StackTrace)`). These two
  // canaries assert that chain is recoverable for both `Effect.fail` and
  // `Effect.die` — see `src/effect-errors/logic/errors/span-annotation.ts` for the
  // extraction and `cause-characterization.test.ts` for the end-to-end render.
  it.effect(
    'recovers the ambient span from a runtime failure (canary for the Cause.StackTrace mechanism)',
    () =>
      Effect.gen(function* () {
        const cause = yield* Effect.fail(new CanaryError({ message: 'boom' })).pipe(
          Effect.withSpan('canary-span'),
          Effect.sandbox,
          Effect.flip
        );

        const frames = extractSpanStackFrames(findFailReason(cause));

        expect(frames.map(frame => frame.name)).toEqual(['canary-span']);
      })
  );

  it.effect('recovers the ambient span from a runtime defect', () =>
    Effect.gen(function* () {
      const cause = yield* Effect.die(new Error('defect boom')).pipe(
        Effect.withSpan('defect-span'),
        Effect.sandbox,
        Effect.flip
      );

      const frames = extractSpanStackFrames(findDieReason(cause));

      expect(frames.map(frame => frame.name)).toEqual(['defect-span']);
    })
  );

  it.effect('recovers a nested span chain innermost-first', () =>
    Effect.gen(function* () {
      const cause = yield* Effect.fail(new CanaryError({ message: 'nested' })).pipe(
        Effect.withSpan('inner-span'),
        Effect.withSpan('outer-span'),
        Effect.sandbox,
        Effect.flip
      );

      const frames = extractSpanStackFrames(findFailReason(cause));

      expect(frames.map(frame => frame.name)).toEqual(['inner-span', 'outer-span']);
    })
  );

  it.effect('returns an empty chain when the reason carries no span annotation', () =>
    Effect.gen(function* () {
      const cause = yield* Effect.fail(new CanaryError({ message: 'no span' })).pipe(
        Effect.sandbox,
        Effect.flip
      );

      expect(extractSpanStackFrames(findFailReason(cause))).toEqual([]);
    })
  );
});
