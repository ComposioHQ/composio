import { Data } from 'effect';

/**
 * A usage mistake the parser cannot see: a flag combination, a value that fails a business
 * rule, a missing input, or an environment the command cannot run in. `effect/cli`'s
 * `CliError.InvalidValue` is a fixed option-and-value struct built only by the parser, so
 * handler-level validation raises this instead. `cli-main.ts` prints `message` as one line
 * and exits 1, with no defect banner.
 */
export class CommandInputError extends Data.TaggedError('commands/CommandInputError')<{
  /** The command path without `composio`, e.g. `login` or `dev triggers disable`. */
  readonly command: string;
  readonly message: string;
  /** The flag or argument at fault, e.g. `--alias` or `<toolkit>`, when there is one. */
  readonly option?: string | undefined;
}> {}

/** Builds the constructor a command uses for its own input errors. */
export const commandInputError =
  (command: string) =>
  (message: string, option?: string): CommandInputError =>
    new CommandInputError({ command, message, option });
