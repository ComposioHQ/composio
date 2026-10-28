import { describe, expect, it } from '@effect/vitest';
import { Cause, Console, Effect, Exit, Layer } from 'effect';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { reportUnreportedCause } from 'src/cli-main';
import { ReportedFailure } from 'src/effects/report-failure';
import { MockConsole } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';

// A fresh console per test, so one test's output never shows up in another's lines.
const TestLayer = Layer.mergeAll(
  Layer.effect(Console.Console, MockConsole.make),
  TerminalUITest,
  BunFileSystem.layer,
  BunPath.layer
);

const report = (cause: Cause.Cause<unknown>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(reportUnreportedCause(cause));
    const stderr = yield* MockConsole.getLines({ stream: 'stderr' });
    return { exit, stderr };
  }).pipe(Effect.provide(TestLayer));

const failureOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;

describe('reportUnreportedCause', () => {
  it.effect('[Given] an interruption alone [Then] it stays an interruption and exits 130', () =>
    Effect.gen(function* () {
      const { exit, stderr } = yield* report(Cause.interrupt());

      expect(Exit.hasInterrupts(exit)).toBe(true);
      expect(exitCodeOf(exit)).toBe(130);
      expect(stderr).toEqual([]);
    })
  );

  it.effect('[Given] a failure already on screen [Then] it is re-failed without printing', () =>
    Effect.gen(function* () {
      const failure = new ReportedFailure({ message: 'already shown' });

      const { exit, stderr } = yield* report(Cause.fail(failure));

      expect(failureOf(exit)).toBe(failure);
      expect(exitCodeOf(exit)).toBe(1);
      expect(stderr).toEqual([]);
    })
  );

  it.effect('[Given] an unreported defect [Then] it is printed once and exits 1', () =>
    Effect.gen(function* () {
      const { exit, stderr } = yield* report(Cause.die(new Error('boom')));

      expect(failureOf(exit)).toBeInstanceOf(ReportedFailure);
      expect(exitCodeOf(exit)).toBe(1);
      expect(stderr).toHaveLength(1);
      expect(stderr[0]).toContain('boom');
    })
  );
});
