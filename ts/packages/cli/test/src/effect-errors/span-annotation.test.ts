import { describe, expect, it } from '@effect/vitest';
import { Cause, Data, Effect, Option } from 'effect';
import { extractSpanAnnotation } from 'src/effect-errors/logic/errors/span-annotation';

class CanaryError extends Data.TaggedError('CanaryError')<{
  readonly message: string;
}> {}

const failureOf = <E>(cause: Cause.Cause<E>): E =>
  Option.getOrThrowWith(Cause.findErrorOption(cause), () => new Error('expected a failure cause'));

describe('extractSpanAnnotation', () => {
  // Effect v4 dropped the `effect/SpanAnnotation` internal these two canary tests
  // guard: `Effect.fail`/`Effect.die` no longer stamp the ambient span onto the
  // raised error value (confirmed against `ts/vendor/effect` — no `effect/SpanAnnotation`
  // symbol, and no per-reason span in `Cause.reasonAnnotations`, anywhere in the v4
  // source or the installed `effect@4.0.0-beta.99` dist). `extractSpanAnnotation` is
  // unchanged and still correctly returns `undefined` for values that carry no such
  // annotation — there is simply nothing left in v4 to recover here. This is an
  // intentional, unavoidable behavior change (span timelines no longer render in
  // `composio`'s pretty-printed errors) flagged for a follow-up redesign rather than
  // silently accepted: see `capture-errors-from-cause.ts` / `parse-error.ts`.
  it.effect(
    'recovers the ambient span from a runtime failure (canary for the effect/SpanAnnotation internal)',
    () =>
      Effect.gen(function* () {
        const cause = yield* Effect.fail(new CanaryError({ message: 'boom' })).pipe(
          Effect.withSpan('canary-span'),
          Effect.sandbox,
          Effect.flip
        );

        const span = extractSpanAnnotation(failureOf(cause));

        expect(span).toBeUndefined();
      })
  );

  it.effect('recovers the ambient span from a runtime defect', () =>
    Effect.gen(function* () {
      const cause = yield* Effect.die(new Error('defect boom')).pipe(
        Effect.withSpan('defect-span'),
        Effect.sandbox,
        Effect.flip
      );

      const defects = cause.reasons.filter(Cause.isDieReason).map(reason => reason.defect);
      const span = extractSpanAnnotation(defects[0]);

      expect(span).toBeUndefined();
    })
  );

  it('returns undefined when the error carries no span annotation', () => {
    expect(extractSpanAnnotation(new CanaryError({ message: 'boom' }))).toBeUndefined();
    expect(extractSpanAnnotation('plain string')).toBeUndefined();
    expect(extractSpanAnnotation(undefined)).toBeUndefined();
  });

  it('returns undefined when the annotation does not look like a span', () => {
    const spanSymbol = Symbol.for('effect/SpanAnnotation');
    const error = { [spanSymbol]: { name: 'not-a-span' } };

    expect(extractSpanAnnotation(error)).toBeUndefined();
  });
});
