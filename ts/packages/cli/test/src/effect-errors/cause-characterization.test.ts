import { describe, expect, it } from '@effect/vitest';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { Cause, Data, Effect } from 'effect';

import { captureErrors } from 'src/effect-errors/capture-errors';
import { captureErrorsFrom } from 'src/effect-errors/logic/errors/capture-errors-from-cause';
import { prettyPrintFromCapturedErrors } from 'src/effect-errors/pretty-print-from-captured-errors';

// Characterization tests pinning the v3 Cause traversal and rendering
// behavior, so the Effect v4 migration (flat failure list instead of the
// Empty/Fail/Die/Interrupt/Sequential/Parallel tree) has an executable
// equivalence oracle instead of eyeballing error output.

class DbError extends Data.TaggedError('DbError')<{
  readonly message: string;
}> {}

class HttpError extends Data.TaggedError('HttpError')<{
  readonly message: string;
}> {}

const stripAnsi = (value: string): string => value.replace(/\x1b\[[0-9;]*m/g, '');

const render = (captured: Effect.Success<ReturnType<typeof capture>>): string =>
  stripAnsi(
    prettyPrintFromCapturedErrors(captured, {
      enabled: true,
      stripCwd: true,
      hideStackTrace: true,
    })
  );

const capture = <E>(cause: Cause.Cause<E>) =>
  captureErrors(cause).pipe(Effect.provide([BunFileSystem.layer, BunPath.layer]));

describe('captureErrorsFrom (structural Cause traversal)', () => {
  it('returns no errors for an empty cause', () => {
    expect(captureErrorsFrom(Cause.empty)).toStrictEqual([]);
  });

  it('captures a tagged failure with its type and message', () => {
    const [error, ...rest] = captureErrorsFrom(Cause.fail(new DbError({ message: 'no db' })));

    expect(rest).toStrictEqual([]);
    expect(error?.errorType).toBe('DbError');
    expect(error?.message).toBe('no db');
    expect(error?.isPlainString).toBe(false);
  });

  it('captures a plain-string failure as a plain string', () => {
    const [error] = captureErrorsFrom(Cause.fail('boom'));

    expect(error?.isPlainString).toBe(true);
    expect(error?.message).toBe('boom');
  });

  it('captures a defect', () => {
    const [error, ...rest] = captureErrorsFrom(Cause.die(new Error('kaboom')));

    expect(rest).toStrictEqual([]);
    expect(error?.errorType).toBe('Error');
    expect(error?.message).toStrictEqual(['kaboom']);
  });

  it('captures nothing for an interruption', () => {
    expect(captureErrorsFrom(Cause.interrupt())).toStrictEqual([]);
  });

  it('flattens a sequential cause left to right', () => {
    const cause = Cause.combine(
      Cause.fail(new DbError({ message: 'first' })),
      Cause.die(new Error('second'))
    );

    const errors = captureErrorsFrom(cause);

    expect(errors.map(error => error.errorType)).toStrictEqual(['DbError', 'Error']);
  });

  it('flattens a parallel cause left to right', () => {
    const cause = Cause.combine(
      Cause.fail(new DbError({ message: 'left' })),
      Cause.fail(new HttpError({ message: 'right' }))
    );

    const errors = captureErrorsFrom(cause);

    expect(errors.map(error => error.message)).toStrictEqual(['left', 'right']);
  });

  it('flattens nested parallel-in-sequential causes in traversal order', () => {
    const cause = Cause.combine(
      Cause.combine(
        Cause.fail(new DbError({ message: 'a' })),
        Cause.fail(new HttpError({ message: 'b' }))
      ),
      Cause.fail(new DbError({ message: 'c' }))
    );

    const errors = captureErrorsFrom(cause);

    expect(errors.map(error => error.message)).toStrictEqual(['a', 'b', 'c']);
  });

  it('ignores interruptions mixed with failures', () => {
    const cause = Cause.combine(
      Cause.interrupt(),
      Cause.fail(new DbError({ message: 'still there' }))
    );

    const errors = captureErrorsFrom(cause);

    expect(errors.map(error => error.message)).toStrictEqual(['still there']);
  });

  // Effect v4 dropped the `effect/SpanAnnotation` internal that let `Effect.fail`/
  // `Effect.die` stamp the ambient span directly onto the raised error value. The
  // analogous v4 mechanism recovers the span one level up, from the `Cause`
  // `Reason`'s `Cause.StackTrace` annotation (see
  // `src/effect-errors/logic/errors/span-annotation.ts` and the canaries in
  // `test/src/effect-errors/span-annotation.test.ts`), so `captureErrorsFrom`
  // still threads the ambient span into the captured error — just as a name
  // chain rather than the old v3 `Span` object.
  it.effect('threads the ambient span from a runtime failure into the captured error', () =>
    Effect.gen(function* () {
      const cause = yield* Effect.fail(new DbError({ message: 'no db' })).pipe(
        Effect.withSpan('characterization-span'),
        Effect.sandbox,
        Effect.flip
      );

      const [error] = captureErrorsFrom(cause);

      expect(error?.spans.map(span => span.name)).toEqual(['characterization-span']);
    })
  );
});

describe('captureErrors + prettyPrintFromCapturedErrors (rendering)', () => {
  it.effect(
    'reports interrupt-only causes as interrupted and renders the interruption message',
    () =>
      Effect.gen(function* () {
        const captured = yield* capture(Cause.interrupt());

        expect(captured).toStrictEqual({ interrupted: true, errors: [] });
        expect(render(captured)).toBe('✅ All fibers interrupted without errors.');
      })
  );

  it.effect('renders a single failure without the multi-error header', () =>
    Effect.gen(function* () {
      const captured = yield* capture(Cause.fail(new DbError({ message: 'no db' })));
      const output = render(captured);

      expect(captured.interrupted).toBe(false);
      expect(output).toContain('💥  DbError  • no db');
      expect(output).not.toContain('errors occurred');
      expect(output).not.toContain('#1 -');
    })
  );

  // Same v4 mechanism as above, exercised end to end: the span recovered from the
  // `Cause.StackTrace` reason annotation now renders as a (duration-less) span
  // timeline instead of falling back to the "consider using spans" hint.
  it.effect('renders a runtime failure with a span timeline recovered from the Cause', () =>
    Effect.gen(function* () {
      const cause = yield* Effect.fail(new HttpError({ message: 'request failed' })).pipe(
        Effect.withSpan('characterization-span'),
        Effect.sandbox,
        Effect.flip
      );

      const output = render(yield* capture(cause));

      expect(output).toContain('💥  HttpError  • request failed');
      expect(output).toContain('◯');
      expect(output).toContain('characterization-span');
      expect(output).not.toContain('Consider using spans to improve errors reporting');
    })
  );

  it.effect('renders multiple failures with a count header and per-error indexes in order', () =>
    Effect.gen(function* () {
      const cause = Cause.combine(
        Cause.fail(new DbError({ message: 'left' })),
        Cause.fail(new HttpError({ message: 'right' }))
      );

      const output = render(yield* capture(cause));

      expect(output).toContain('2 errors occurred');
      expect(output).toContain('💥  #1 - DbError  • left');
      expect(output).toContain('💥  #2 - HttpError  • right');
      expect(output.indexOf('DbError')).toBeLessThan(output.indexOf('HttpError'));
    })
  );
});
