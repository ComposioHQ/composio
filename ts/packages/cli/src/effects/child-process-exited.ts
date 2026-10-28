import { Data, Runtime } from 'effect';
import { signalExitCode, type TerminationSignal } from 'src/services/shutdown-signal';

/**
 * A child process the command proxies (`composio run`) exited with a non-zero `code`. The child
 * already wrote its own output, so the runner logs nothing (`[Runtime.errorReported]` is false)
 * and `Runtime.defaultTeardown` exits with the child's code.
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

/**
 * A child process the command proxies (`composio run`) was ended by `signal`. The runner
 * (`src/run-main.ts`) re-raises the signal so the CLI ends the same way; the exit code, 128 + n,
 * is what a caller sees if the re-raise cannot end the process.
 */
export class ChildProcessSignaled extends Data.TaggedError('effects/ChildProcessSignaled')<{
  readonly signal: TerminationSignal;
}> {
  get [Runtime.errorReported]() {
    return false;
  }

  get [Runtime.errorExitCode]() {
    return signalExitCode(this.signal);
  }
}
