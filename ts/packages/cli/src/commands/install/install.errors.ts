import { Data, Runtime } from 'effect';

/**
 * Aborted shell setup must fail the process: install.sh only runs its guarded
 * inline PATH fallback when `composio install` exits non-zero, so a successful
 * exit here would leave the user with no PATH setup and a green install. The
 * abort reason is already printed before this error is raised, so the runtime
 * prints nothing further (`[Runtime.errorReported]` is false) and exits 1.
 */
export class ShellSetupAbortError extends Data.TaggedError('commands/ShellSetupAbortError')<{
  readonly message: string;
}> {
  get [Runtime.errorReported]() {
    return false;
  }

  get [Runtime.errorExitCode]() {
    return 1;
  }
}
