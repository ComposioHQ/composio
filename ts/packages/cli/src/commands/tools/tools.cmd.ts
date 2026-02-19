import { Command } from '@effect/cli';
import { toolsCmd$List } from './commands/tools.list.cmd';
import { toolsCmd$Info } from './commands/tools.info.cmd';
import { toolsCmd$Search } from './commands/tools.search.cmd';

/**
 * CLI entry point for tool discovery commands.
 *
 * @example
 * ```bash
 * composio tools <command>
 * ```
 */
export const toolsCmd = Command.make('tools').pipe(
  Command.withDescription('Discover and inspect Composio tools.'),
  Command.withSubcommands([toolsCmd$List, toolsCmd$Info, toolsCmd$Search])
);
