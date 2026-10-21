import { Data } from 'effect';
import {
  ConnectionPollingError,
  MissingLinkUserIdError,
} from 'src/commands/connected-accounts/link/connected-accounts.link.errors';
import { InvalidOrganizationError } from 'src/commands/login/login.errors';
import { ProxyCommandError } from 'src/commands/proxy.errors';
import { ToolExecutionError } from 'src/commands/tools/commands/tools.execute.errors';
import { LoginSessionError } from 'src/effects/browser-login';
import { ComposioCorePkgNotFound } from 'src/effects/find-composio-core-generated';
import {
  InvalidToolkitVersionsValidationError,
  ToolkitVersionValidationError,
} from 'src/effects/validate-toolkit-versions';
import { ProjectResolutionError } from 'src/services/command-project';
import { ConnectedAccountResolutionError } from 'src/services/connected-account-selection';
import { PendingLoginError } from 'src/services/pending-login-session';
import { ProjectEnvironmentDetectorError } from 'src/services/project-environment-detector';

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
 * Failures the user fixes by changing the invocation or their setup (a missing user id, login,
 * or SDK install; an unknown org, toolkit, or version), or that a remote service reported
 * clearly, not defects. `cli-main.ts` prints the message on stderr and exits 1, with no defect
 * banner. `ToolkitVersionValidationError` counts only for an override naming an unknown
 * toolkit; its request, decoding, and client failures stay defects.
 */
export type UsageFailure =
  | CommandInputError
  | NotLoggedInError
  | ProjectResolutionError
  | ConnectedAccountResolutionError
  | ToolExecutionError
  | ProxyCommandError
  | MissingLinkUserIdError
  | ConnectionPollingError
  | InvalidOrganizationError
  | LoginSessionError
  | PendingLoginError
  | ComposioCorePkgNotFound
  | ProjectEnvironmentDetectorError
  | InvalidToolkitVersionsValidationError
  | ToolkitVersionValidationError;

export const isUsageFailure = (error: unknown): error is UsageFailure =>
  error instanceof CommandInputError ||
  error instanceof NotLoggedInError ||
  error instanceof ProjectResolutionError ||
  error instanceof ConnectedAccountResolutionError ||
  error instanceof ToolExecutionError ||
  error instanceof ProxyCommandError ||
  error instanceof MissingLinkUserIdError ||
  error instanceof ConnectionPollingError ||
  error instanceof InvalidOrganizationError ||
  error instanceof LoginSessionError ||
  error instanceof PendingLoginError ||
  error instanceof ComposioCorePkgNotFound ||
  error instanceof ProjectEnvironmentDetectorError ||
  error instanceof InvalidToolkitVersionsValidationError ||
  (error instanceof ToolkitVersionValidationError && error.reason === 'invalid-toolkit');

/** Builds the constructor a command uses for its own input errors. */
export const commandInputError =
  (command: string) =>
  (message: string, option?: string): CommandInputError =>
    new CommandInputError({ command, message, option });
