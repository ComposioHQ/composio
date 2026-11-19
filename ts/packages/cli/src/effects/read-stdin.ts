import { Data, Duration, Effect, Option } from 'effect';
import { Stdin } from 'src/services/stdin';

/**
 * How long `composio execute` waits for piped JSON to start arriving when it got no `-d`. An
 * agent harness can hand the CLI a pipe it never writes to or closes; waiting for its end would
 * hang the command with no output.
 */
export const PIPED_STDIN_SILENCE_TIMEOUT = Duration.seconds(1);

/**
 * Piped stdin sent nothing (no data and no end of input) within `PIPED_STDIN_SILENCE_TIMEOUT`.
 * The command must fail rather than run as if it had no input: the data may still be on its way.
 */
export class PipedStdinSilentError extends Data.TaggedError('PipedStdinSilentError') {}

/** Reads stdin to its end, however long that takes; for an explicit `-d -`. */
export const readStdin = Effect.gen(function* () {
  const stdin = yield* Stdin;
  return yield* stdin.readAll();
});

/**
 * Reads piped stdin when stdin is not a terminal and the caller passed no input flag. Fails with
 * `PipedStdinSilentError` when the pipe sends nothing within `PIPED_STDIN_SILENCE_TIMEOUT`.
 */
export const readStdinIfPiped = Effect.gen(function* () {
  const stdin = yield* Stdin;
  if (stdin.isTTY()) {
    return Option.none<string>();
  }
  const piped = yield* stdin.readAllUnlessSilent(PIPED_STDIN_SILENCE_TIMEOUT);
  if (Option.isNone(piped)) {
    return yield* new PipedStdinSilentError();
  }
  return piped;
});
