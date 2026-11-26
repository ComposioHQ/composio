import { Data, Runtime } from 'effect';

/**
 * A `composio run` script exited with a nonzero code. It owns its output, and
 * `Runtime.defaultTeardown` exits with the script's code.
 */
export class ChildProcessExited extends Data.TaggedError('effects/ChildProcessExited')<{
  readonly code: number;
}> {
  get [Runtime.errorReported]() {
    return false;
  }

  get [Runtime.errorExitCode]() {
    return this.code;
  }
}
