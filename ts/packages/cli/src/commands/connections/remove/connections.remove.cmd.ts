import { Argument, Command, Flag } from 'effect/cli';
import { runConnectionsRemove } from './connections.remove.handler';

const account = Argument.String('account').pipe(
  Argument.withDescription(
    'Connection selector: toolkit slug, alias, word_id, or connected account ID'
  )
);

const yes = Flag.Boolean('yes').pipe(
  Flag.withAlias('y'),
  Flag.withDefault(false),
  Flag.withDescription('Remove without asking for confirmation')
);

export const connectionsCmd$Remove = Command.make(
  'remove',
  { account, yes },
  runConnectionsRemove
).pipe(
  Command.withDescription(
    'Interactively remove a connection by toolkit slug, alias, word_id, or connected account ID.'
  ),
  Command.withExamples([
    {
      command: 'composio connections remove gmail',
    },
    {
      command: 'composio connections remove work',
    },
    {
      command: 'composio connections remove castle',
    },
    {
      command: 'composio connections remove gmail --yes',
    },
  ])
);
