import { Command } from '@effect/cli';
import { triggersCmd$Info } from './commands/triggers.info.cmd';
import { triggersCmd$List } from './commands/triggers.list.cmd';
import { triggersCmd$Status } from './commands/triggers.status.cmd';
import { triggersCmd$Create } from './commands/triggers.create.cmd';
import { triggersCmd$Enable } from './commands/triggers.enable.cmd';
import { triggersCmd$Disable } from './commands/triggers.disable.cmd';
import { triggersCmd$Listen } from './commands/triggers.listen.cmd';

/**
 * CLI entry point for realtime trigger commands.
 *
 * @example
 * ```bash
 * composio dev triggers <command>
 * ```
 */
export const triggersCmd = Command.make('triggers').pipe(
  Command.withDescription('Inspect and subscribe to trigger events.'),
  Command.withSubcommands([
    triggersCmd$Listen,
    triggersCmd$List,
    triggersCmd$Info,
    triggersCmd$Status,
    triggersCmd$Create,
    triggersCmd$Enable,
    triggersCmd$Disable,
  ])
);
