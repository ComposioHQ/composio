import { describe, expect, it } from '@effect/vitest';
import { Cause, Data, Effect, Option } from 'effect';
import { extractSpanAnnotation } from 'src/effect-errors/logic/errors/span-annotation';

class CanaryError extends Data.TaggedError('CanaryError')<{
  readonly message: string;
}> {}

const failureOf = <E>(cause: Cause.Cause<E>): E =>
  Option.getOrThrowWith(Cause.failureOption(cause), () => new Error('expected a failure cause'));

describe('extractSpanAnnotation', () => {
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

        expect(span).toBeDefined();
        expect(span?.name).toBe('canary-span');
      })
  );

  it.effect('recovers the ambient span from a runtime defect', () =>
    Effect.gen(function* () {
      const cause = yield* Effect.die(new Error('defect boom')).pipe(
        Effect.withSpan('defect-span'),
        Effect.sandbox,
        Effect.flip
      );

      const defects = Cause.defects(cause);
      const span = extractSpanAnnotation([...defects][0]);

      expect(span?.name).toBe('defect-span');
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
