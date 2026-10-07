import { Command } from 'effect/unstable/cli';
import { toolsCmd$List } from './commands/tools.list.cmd';
import { toolsCmd$Info } from './commands/tools.info.cmd';

export const rootToolsCmd = Command.make('tools').pipe(
  Command.withDescription('Browse and inspect tools before executing them.'),
  Command.withExamples([
    {
      command: 'composio tools list gmail',
    },
    {
      command: 'composio tools info GMAIL_SEND_EMAIL',
    },
  ]),
  Command.withSubcommands([toolsCmd$List, toolsCmd$Info])
);
