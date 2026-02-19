import { Command } from '@effect/cli';
import { toolkitsCmd$List } from './commands/toolkits.list.cmd';
import { toolkitsCmd$Info } from './commands/toolkits.info.cmd';
import { toolkitsCmd$Search } from './commands/toolkits.search.cmd';

/**
 * CLI entry point for toolkit discovery commands.
 *
 * @example
 * ```bash
 * composio toolkits <command>
 * ```
 */
export const toolkitsCmd = Command.make('toolkits').pipe(
  Command.withDescription('Discover and inspect Composio toolkits.'),
  Command.withSubcommands([toolkitsCmd$List, toolkitsCmd$Info, toolkitsCmd$Search])
);
