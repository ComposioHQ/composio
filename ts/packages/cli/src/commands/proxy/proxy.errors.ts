import { Data, Runtime } from 'effect';
import { requestError } from 'src/effects/request-error';

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
