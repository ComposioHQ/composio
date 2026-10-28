import { requireLogin } from 'src/effects/require-auth';
import { Command } from 'effect/cli';
import { rejectsSharedFlags } from 'src/commands/surface';
import { toolkitsCmd$List } from './list/toolkits.list.cmd';
import { toolkitsCmd$Info } from './info/toolkits.info.cmd';
import { toolkitsCmd$Search } from './search/toolkits.search.cmd';
import { toolkitsCmd$Version } from './version/toolkits.version.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

/**
 * CLI entry point for toolkit discovery commands.
 *
 * @example
 * ```bash
 * composio dev toolkits <command>
 * ```
 */
export const toolkitsCmd = Command.make('toolkits').pipe(
  Command.withDescription('Discover and inspect Composio toolkits.'),
  withRegisteredSubcommands([
    toolkitsCmd$List,
    toolkitsCmd$Info,
    toolkitsCmd$Search.pipe(rejectsSharedFlags('dev toolkits search')),
    toolkitsCmd$Version.pipe(rejectsSharedFlags('dev toolkits version')),
  ]),
  requireLogin
);
