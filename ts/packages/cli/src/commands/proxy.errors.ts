import { Data } from 'effect';

type ProxyCommandErrorFields = {
  readonly reason: 'missing_consumer_user' | 'toolkit_not_connected';
  readonly message: string;
  readonly toolkit?: string;
  readonly endpoint?: string;
};

/**
 * `composio proxy` has no consumer user to send the request as. `cli-main.ts` prints the
 * message as one line and exits 1.
 */
export class ProxyCommandError extends Data.TaggedError(
  'commands/ProxyCommandError'
)<ProxyCommandErrorFields> {}

/**
 * A proxy call refused before sending it, already reported on stderr and as
 * `{ "successful": false, ... }` on stdout. `cli-main.ts` prints nothing more and exits 1.
 */
export class ReportedProxyCommandError extends Data.TaggedError(
  'commands/ReportedProxyCommandError'
)<ProxyCommandErrorFields> {}
