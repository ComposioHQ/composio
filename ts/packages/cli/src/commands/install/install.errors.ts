import { Data } from 'effect';

/**
 * Aborted shell setup must fail the process: install.sh only runs its guarded
 * inline PATH fallback when `composio install` exits non-zero, so a successful
 * exit here would leave the user with no PATH setup and a green install. The
 * abort reason is already printed before this error is raised; cli-main.ts
 * maps it to exit code 1 without printing anything further.
 */
export class ShellSetupAbortError extends Data.TaggedError('commands/ShellSetupAbortError')<{
  readonly message: string;
}> {}
