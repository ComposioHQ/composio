import { Duration, Effect, Option } from 'effect';
import { Stdin } from 'src/services/stdin';
import { TerminalUI } from 'src/services/terminal-ui';

/**
 * How long a command waits for piped stdin to send anything when the caller did not ask for
 * stdin with `-d -`. Past it, the silent pipe counts as no input instead of hanging the command.
 */
export const PIPED_STDIN_SILENCE_TIMEOUT = Duration.seconds(1);

export const readStdin = Effect.gen(function* () {
  const stdin = yield* Stdin;
  return yield* stdin.readAll();
});

/**
 * Reads piped stdin when stdin is not a terminal. A pipe that sends nothing (no data and no end
 * of input) within `PIPED_STDIN_SILENCE_TIMEOUT` counts as no input.
 */
export const readStdinIfPiped = Effect.gen(function* () {
  const stdin = yield* Stdin;
  if (stdin.isTTY()) {
    return Option.none<string>();
  }
  const piped = yield* stdin.readAllUnlessSilent(PIPED_STDIN_SILENCE_TIMEOUT);
  if (Option.isNone(piped)) {
    const ui = yield* TerminalUI;
    yield* ui.log.warn(
      'Ignored stdin: nothing arrived on it within 1 second. Pass -d - to wait for input on stdin.'
    );
  }
  return piped;
});
