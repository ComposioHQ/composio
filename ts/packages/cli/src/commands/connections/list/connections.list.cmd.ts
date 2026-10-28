import { Command, Flag } from 'effect/cli';
import { runConnectionsList } from './connections.list.handler';

const toolkit = Flag.String('toolkit').pipe(
  Flag.withDescription('Filter by toolkit slug (e.g. "gmail")'),
  Flag.optional
);

export const connectionsCmd$List = Command.make('list', { toolkit }, runConnectionsList).pipe(
  Command.withDescription(
    'List connections as JSON with each account id and status, plus its alias, word_id, and provider display name when available.'
  ),
  Command.withExamples([
    {
      command: 'composio connections list',
    },
    {
      command: 'composio connections list --toolkit gmail',
    },
  ])
);
