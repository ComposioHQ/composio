import { Argument, Command } from 'effect/cli';
import { runConnectedAccountsWhoami } from './connected-accounts.whoami.handler';

const id = Argument.String('id').pipe(
  Argument.withDescription('Connected account ID (nanoid)'),
  Argument.optional
);

export const connectedAccountsCmd$Whoami = Command.make(
  'whoami',
  { id },
  runConnectedAccountsWhoami
).pipe(Command.withDescription('Show the external account profile for a connected account.'));
