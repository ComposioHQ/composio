import { Argument, Command } from 'effect/cli';
import { runConnectedAccountsInfo } from './connected-accounts.info.handler';

const id = Argument.String('id').pipe(
  Argument.withDescription('Connected account ID (nanoid)'),
  Argument.optional
);

/**
 * View details of a specific connected account.
 *
 * @example
 * ```bash
 * composio dev connected-accounts info "con_1a2b3c4d5e6f"
 * ```
 */
export const connectedAccountsCmd$Info = Command.make(
  'info',
  { id },
  runConnectedAccountsInfo
).pipe(Command.withDescription('View details of a specific connected account.'));
