import { Argument, Command } from 'effect/cli';
import { runConnectedAccountsWhoami } from './connected-accounts.whoami.handler';

const id = Argument.String('id').pipe(
  Argument.withDescription('Connected account ID (nanoid)'),
  Argument.optional
);

/**
 * Show the external account profile for a connected account.
 *
 * Retrieves the connected account details and displays a summary
 * of who is connected (toolkit, user, status). Warns when the
 * connection is in a non-ACTIVE state.
 *
 * @example
 * ```bash
 * composio dev connected-accounts whoami "con_1a2b3c4d5e6f"
 * ```
 */
export const connectedAccountsCmd$Whoami = Command.make(
  'whoami',
  { id },
  runConnectedAccountsWhoami
).pipe(Command.withDescription('Show the external account profile for a connected account.'));
