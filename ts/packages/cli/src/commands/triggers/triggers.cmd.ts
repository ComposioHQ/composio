import { Command } from '@effect/cli';
import { triggersCmd$Info } from './commands/triggers.info.cmd';
import { triggersCmd$List } from './commands/triggers.list.cmd';
import { triggersCmd$Listen } from './commands/triggers.listen.cmd';
import { triggersCmd$Status } from './commands/triggers.status.cmd';
import { triggersCmd$Create } from './commands/triggers.create.cmd';
import { triggersCmd$Enable } from './commands/triggers.enable.cmd';
import { triggersCmd$Disable } from './commands/triggers.disable.cmd';
import { triggersCmd$Delete } from './commands/triggers.delete.cmd';

/**
 * CLI entry point for realtime trigger commands.
 *
 * @example
 * ```bash
 * composio manage triggers <command>
 * ```
 */
export const triggersCmd = Command.make('triggers').pipe(
  Command.withDescription('Inspect and subscribe to trigger events.'),
  Command.withSubcommands([
    triggersCmd$List,
    triggersCmd$Info,
    triggersCmd$Listen,
    triggersCmd$Status,
    triggersCmd$Create,
    triggersCmd$Enable,
    triggersCmd$Disable,
    triggersCmd$Delete,
  ])
);
