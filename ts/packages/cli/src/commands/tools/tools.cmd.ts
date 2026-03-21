import { Command } from '@effect/cli';
import { toolsCmd$List } from './commands/tools.list.cmd';
import { toolsCmd$Info } from './commands/tools.info.cmd';
import { toolsCmd$Search } from './commands/tools.search.cmd';
import { toolsCmd$Execute } from './commands/tools.execute.cmd';

/**
 * CLI entry point for tool discovery commands.
 *
 * @example
 * ```bash
 * composio tools <command>
 * ```
 */
export const toolsCmd = Command.make('tools').pipe(
  Command.withDescription('Legacy tool namespace for discovery and inspection.'),
  Command.withSubcommands([toolsCmd$List, toolsCmd$Info, toolsCmd$Search, toolsCmd$Execute])
);

export const rootToolsCmd = Command.make('tools').pipe(
  Command.withDescription('Browse and inspect tools before executing them.'),
  Command.withSubcommands([toolsCmd$List, toolsCmd$Info])
);
