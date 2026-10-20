import { Data } from 'effect';
import { ProjectResolutionError } from 'src/services/command-project';
import { ConnectedAccountResolutionError } from 'src/services/connected-account-selection';

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

/** The command needs a logged-in user and `~/.composio` holds no API key. */
export class NotLoggedInError extends Data.TaggedError('commands/NotLoggedInError')<{
  readonly message: string;
}> {}

export const notLoggedIn = (): NotLoggedInError =>
  new NotLoggedInError({ message: 'You are not logged in yet. Please run `composio login`.' });

/**
 * Failures the user fixes by changing the invocation or their setup, not defects. `cli-main.ts`
 * prints the message as one line on stderr and exits 1.
 */
export type UsageFailure =
  CommandInputError | NotLoggedInError | ProjectResolutionError | ConnectedAccountResolutionError;

export const isUsageFailure = (error: unknown): error is UsageFailure =>
  error instanceof CommandInputError ||
  error instanceof NotLoggedInError ||
  error instanceof ProjectResolutionError ||
  error instanceof ConnectedAccountResolutionError;

/** Builds the constructor a command uses for its own input errors. */
export const commandInputError =
  (command: string) =>
  (message: string, option?: string): CommandInputError =>
    new CommandInputError({ command, message, option });
