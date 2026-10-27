import { Effect } from 'effect';
import { NodeProcess } from 'src/services/node-process';
import type { TerminalUI } from 'src/services/terminal-ui';

/**
 * Reports a failure the command recovers from instead of failing: sets the exit code to 1 and
 * prints `message`, then `hint` when there is one, on stderr. On a terminal they render as a
 * decorated error and step; otherwise as plain lines, since `ui.log.*` decoration is dropped
 * when stderr is not a TTY and scripts, CI and agents would see nothing.
 *
 * A usage mistake fails with a `CommandInputError` instead; see `src/commands/errors.ts`.
 */
export const reportFailure = (ui: TerminalUI, message: string, hint?: string) =>
  Effect.gen(function* () {
    const proc = yield* NodeProcess;
    yield* proc.setExitCode(1);

    const { canDecorate } = yield* ui.capabilities;
    const [error, step] = canDecorate ? [ui.log.error, ui.log.step] : [ui.error, ui.error];
    yield* error(message);
    if (hint !== undefined) {
      yield* step(hint);
    }
  });
