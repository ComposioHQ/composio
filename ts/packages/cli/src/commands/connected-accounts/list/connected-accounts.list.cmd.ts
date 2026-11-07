import { Command, Flag } from 'effect/cli';
import { runConnectedAccountsList } from './connected-accounts.list.handler';

const toolkits = Flag.String('toolkits').pipe(
  Flag.withDescription('Filter by toolkit slugs, comma-separated (e.g. "gmail" or "gmail,slack")'),
  Flag.optional
);

const status = Flag.Literals('status', [
  'INITIALIZING',
  'INITIATED',
  'ACTIVE',
  'FAILED',
  'EXPIRED',
  'INACTIVE',
  'REVOKED',
] as const).pipe(Flag.withDescription('Filter by connection status'), Flag.optional);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(30),
  Flag.withDescription('Number of results per page (1-1000)')
);

/**
 * List connected accounts with optional filters.
 *
 * @example
 * ```bash
 * composio dev connected-accounts list
 * composio dev connected-accounts list --toolkits "gmail"
 * composio dev connected-accounts list --user-id "default" --status ACTIVE
 * ```
 */
export const connectedAccountsCmd$List = Command.make(
  'list',
  { toolkits, status, limit },
  runConnectedAccountsList
).pipe(Command.withDescription('List connected accounts.'));
