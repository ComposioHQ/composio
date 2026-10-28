import { Data, Effect, Runtime } from 'effect';
import type { TerminalUI } from 'src/services/terminal-ui';

/**
 * A failure already shown to the user. It only makes the command fail: the runner does not
 * log it (`[Runtime.errorReported]` is false) and `Runtime.defaultTeardown` exits 1.
 *
 * The markers are getters, like `ExpectedFailure`, so they stay off the instance's own properties.
 */
export class ReportedFailure extends Data.TaggedError('effects/ReportedFailure')<{
  readonly message: string;
}> {
  get [Runtime.errorReported]() {
    return false;
  }

  get [Runtime.errorExitCode]() {
    return 1;
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
 * `ReportedFailure`, so the process exits 1 without printing more.
 *
 * A usage mistake fails with a `CommandInputError` instead; see `src/commands/errors.ts`.
 */
export const reportFailure = (
  ui: TerminalUI,
  message: string,
  hint?: string
): Effect.Effect<never, ReportedFailure> =>
  printFailure(ui, message, hint).pipe(
    Effect.andThen(Effect.fail(new ReportedFailure({ message })))
  );
