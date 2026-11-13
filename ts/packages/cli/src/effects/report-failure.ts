import { Data, Effect, Runtime } from 'effect';
import { TEMPORARY_FAILURE_EXIT_CODE } from 'src/effects/retry-advice';
import type { TerminalUI } from 'src/services/terminal-ui';

/**
 * A failure already shown to the user. It only makes the command fail: the runner does not
 * log it (`[Runtime.errorReported]` is false) and `Runtime.defaultTeardown` exits 1, or
 * `TEMPORARY_FAILURE_EXIT_CODE` (75) when it is `retryable`: running the same command again is
 * safe and may pass (see `src/effects/retry-advice.ts`).
 *
 * The markers are getters, like `ExpectedFailure`, so they stay off the instance's own properties.
 */
export class ReportedFailure extends Data.TaggedError('effects/ReportedFailure')<{
  readonly message: string;
  readonly retryable?: boolean;
}> {
  get [Runtime.errorReported]() {
    return false;
  }

  get [Runtime.errorExitCode]() {
    return this.retryable === true ? TEMPORARY_FAILURE_EXIT_CODE : 1;
  }
}

/**
 * Prints `message`, then `hint` when there is one, on stderr. On a terminal they render as a
 * decorated error and step; otherwise as plain lines, since `ui.log.*` decoration is dropped
 * when stderr is not a TTY and scripts, CI and agents would see nothing.
 *
 * Use it directly only when the command prints more before it fails with a `ReportedFailure`;
 * otherwise use `reportFailure`.
 */
export const printFailure = (ui: TerminalUI, message: string, hint?: string) =>
  Effect.gen(function* () {
    const { canDecorate } = yield* ui.capabilities;
    const [error, step] = canDecorate ? [ui.log.error, ui.log.step] : [ui.error, ui.error];
    yield* error(message);
    if (hint !== undefined) {
      yield* step(hint);
    }
  });

/**
 * Reports a failure the command handles itself: prints it like `printFailure`, then fails with a
 * `ReportedFailure`, so the process exits 1 (75 when `retryable`) without printing more.
 *
 * A usage mistake fails with a `CommandInputError` instead; see `src/commands/errors.ts`.
 */
export const reportFailure = (
  ui: TerminalUI,
  message: string,
  hint?: string,
  options?: { readonly retryable?: boolean }
): Effect.Effect<never, ReportedFailure> =>
  printFailure(ui, message, hint).pipe(
    Effect.andThen(
      Effect.fail(
        new ReportedFailure(
          options?.retryable === true ? { message, retryable: true } : { message }
        )
      )
    )
  );
