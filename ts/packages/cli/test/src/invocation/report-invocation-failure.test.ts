import { describe, expect, it } from '@effect/vitest';
import { Cause, Console, Data, Effect, Exit, Layer } from 'effect';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { APIConnectionTimeoutError, AuthenticationError } from '@composio/client/effect';
import { ExpectedFailure } from 'src/effects/expected-failure';
import { ReportedFailure } from 'src/effects/report-failure';
import { requestError } from 'src/effects/request-error';
import { retryHint, TEMPORARY_FAILURE_EXIT_CODE } from 'src/effects/retry-advice';
import { reportInvocationFailure } from 'src/invocation/invocation';
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
    const exit = yield* Effect.exit(reportInvocationFailure(cause));
    const stderr = yield* MockConsole.getLines({ stream: 'stderr' });
    return { exit, stderr };
  }).pipe(Effect.provide(TestLayer));

// Standalone controls (BEL, DEL, NEL) and line breaks, as a remote message could carry them.
const remoteText = 'remote\u0007text\u007f\u0085';

class RemoteExpectedFailure extends Data.TaggedError('test/RemoteExpectedFailure')<{
  readonly message: string;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

const failureOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;

describe('reportInvocationFailure', () => {
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
      const defect = new Error('boom');

      const { exit, stderr } = yield* report(Cause.die(defect));

      expect(failureOf(exit)).toBe(defect);
      expect(exitCodeOf(exit)).toBe(1);
      expect(stderr).toHaveLength(1);
      expect(stderr[0]).toContain('boom');
    })
  );

  it.effect('[Given] a request failure safe to send again [Then] it says so and exits 75', () =>
    Effect.gen(function* () {
      class FetchError extends requestError('test/FetchError') {}
      const failure = new FetchError({
        message: 'Failed to fetch toolkits.',
        cause: new APIConnectionTimeoutError({
          message: 'Request timed out.',
          method: 'GET',
          url: 'https://backend.composio.dev/api/v3.1/toolkits',
        }),
      });

      const { exit, stderr } = yield* report(Cause.fail(failure));

      expect(failureOf(exit)).toBe(failure);
      expect(exitCodeOf(exit)).toBe(TEMPORARY_FAILURE_EXIT_CODE);
      expect(stderr.at(-1)).toBe(retryHint('safe'));
    })
  );

  it.effect('[Given] a POST that timed out [Then] it exits 1 with no retry advice', () =>
    Effect.gen(function* () {
      const failure = new APIConnectionTimeoutError({
        message: 'Request timed out.',
        method: 'POST',
        url: 'https://backend.composio.dev/api/v3.1/auth_configs',
      });

      const { exit, stderr } = yield* report(Cause.fail(failure));

      expect(exitCodeOf(exit)).toBe(1);
      expect(stderr.join('\n')).not.toContain(retryHint('safe'));
    })
  );

  it.effect(
    '[Given] an expected failure quoting remote text [Then] its controls print as escapes and it exits 1',
    () =>
      Effect.gen(function* () {
        const failure = new RemoteExpectedFailure({
          message: `Request failed: ${remoteText}\r\nRun the command again.\rdone`,
        });

        const { exit, stderr } = yield* report(Cause.fail(failure));

        expect(failureOf(exit)).toBe(failure);
        expect(exitCodeOf(exit)).toBe(1);
        // CRLF stays a line break; a lone CR does not.
        expect(stderr).toEqual([
          'Request failed: remote\\u0007text\\u007f\\u0085\nRun the command again.\\u000ddone',
        ]);
      })
  );

  it.effect(
    '[Given] a 401 whose backend message has controls [Then] it prints as one escaped line',
    () =>
      Effect.gen(function* () {
        const failure = new AuthenticationError({
          message: '401 Unauthorized',
          method: 'GET',
          url: 'https://backend.composio.dev/api/v3.1/toolkits',
          status: 401,
          requestId: undefined,
          details: {
            message: `Key\nrejected ${remoteText}`,
            code: 401,
            slug: 'unauthorized',
            status: 401,
          },
          body: undefined,
        });

        const { exit, stderr } = yield* report(Cause.fail(failure));

        expect(exitCodeOf(exit)).toBe(1);
        expect(stderr[0]).toBe('Key\\u000arejected remote\\u0007text\\u007f\\u0085');
      })
  );

  it.effect(
    '[Given] a multiline defect message [Then] the error title preserves line breaks and escapes unsafe controls',
    () =>
      Effect.gen(function* () {
        const { exit, stderr } = yield* report(Cause.die(new Error(`boom\n${remoteText}\rdone`)));

        expect(exitCodeOf(exit)).toBe(1);
        expect(stderr).toHaveLength(1);
        expect(stderr[0]).toContain('boom\nremote\\u0007text\\u007f\\u0085\\u000ddone');
        expect(stderr[0]).not.toMatch(/[\u0007\u007f\u0085]/u);
      })
  );
});
