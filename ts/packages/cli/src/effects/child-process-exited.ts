import { Data, Runtime } from 'effect';

/**
 * A child process the command proxies (`composio run`) exited with a non-zero `code`. The child
 * already wrote its own output, so `BunRuntime.runMain` logs nothing (`[Runtime.errorReported]`
 * is false) and `Runtime.defaultTeardown` exits with the child's code.
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
