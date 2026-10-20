import { Argument, Command } from 'effect/cli';
import { runConnectedAccountsInfo } from './connected-accounts.info.handler';

const id = Argument.String('id').pipe(
  Argument.withDescription('Connected account ID (nanoid)'),
  Argument.optional
);

export const connectedAccountsCmd$Info = Command.make(
  'info',
  { id },
  runConnectedAccountsInfo
).pipe(Command.withDescription('View details of a specific connected account.'));
