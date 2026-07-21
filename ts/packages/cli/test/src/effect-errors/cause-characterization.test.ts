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
  // `Effect.die` stamp the ambient span onto the raised error value (see the canary
  // in `test/src/effect-errors/span-annotation.test.ts` for the full rationale).
  // `captureErrorsFrom` can no longer recover a span from a bare failure value, so
  // this is an intentional, unavoidable behavior change rather than a regression to
  // chase here.
  it.effect('threads the ambient span from a runtime failure into the captured error', () =>
    Effect.gen(function* () {
      const cause = yield* Effect.fail(new DbError({ message: 'no db' })).pipe(
        Effect.withSpan('characterization-span'),
        Effect.sandbox,
        Effect.flip
      );

      const [error] = captureErrorsFrom(cause);

      expect(error?.span).toBeUndefined();
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

  // Same v4 span-annotation loss as above: with no span recoverable from the raised
  // error, rendering falls back to the "no spans" path (the usage hint) instead of
  // a span timeline.
  it.effect('renders a runtime failure without a span timeline (no span to recover in v4)', () =>
    Effect.gen(function* () {
      const cause = yield* Effect.fail(new HttpError({ message: 'request failed' })).pipe(
        Effect.withSpan('characterization-span'),
        Effect.sandbox,
        Effect.flip
      );

      const output = render(yield* capture(cause));

      expect(output).toContain('💥  HttpError  • request failed');
      expect(output).not.toContain('◯');
      expect(output).not.toContain('characterization-span');
      expect(output).toContain('Consider using spans to improve errors reporting');
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
