import { Data, Runtime } from 'effect';
import { ExpectedFailure } from 'src/effects/expected-failure';
import { requestError } from 'src/effects/request-error';

/**
 * `composio proxy` has no consumer user to send the request as. An expected failure:
 * the invocation (`src/invocation/invocation.ts`) prints the message and exits 1.
 */
export class ProxyCommandError extends Data.TaggedError('commands/ProxyCommandError')<{
  readonly message: string;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

/**
 * A proxy call refused before sending it because the toolkit is not connected, already reported
 * on stderr and as `{ "successful": false, ... }` on stdout. The runtime prints nothing more
 * (`[Runtime.errorReported]` is false) and exits 1.
 */
export class ReportedProxyCommandError extends Data.TaggedError(
  'commands/ReportedProxyCommandError'
)<{
  readonly message: string;
  readonly toolkit: string;
  readonly endpoint: string;
}> {
  get [Runtime.errorReported]() {
    return false;
  }

  get [Runtime.errorExitCode]() {
    return 1;
  }
}

export class ProxyRequestError extends requestError('commands/ProxyRequestError') {}
