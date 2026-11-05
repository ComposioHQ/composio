import { withCommandMeta } from 'src/invocation/command-identity';
import { Command } from 'effect/cli';
import { toolsCmd$List } from './list/tools.list.cmd';
import { toolsCmd$Info } from './info/tools.info.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

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
  withRegisteredSubcommands([toolsCmd$List, toolsCmd$Info]),
  withCommandMeta({ requiresLogin: true })
);
