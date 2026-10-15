import { requireLogin } from 'src/effects/require-auth';
import { Command } from 'effect/cli';
import { rejectsProjectName } from 'src/commands/surface';
import { triggersCmd$Info } from './info/triggers.info.cmd';
import { triggersCmd$List } from './list/triggers.list.cmd';
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
    triggersCmd$List.pipe(rejectsProjectName('dev triggers list')),
    triggersCmd$Info.pipe(rejectsProjectName('dev triggers info')),
    triggersCmd$Status.pipe(rejectsProjectName('dev triggers status')),
    triggersCmd$Create.pipe(rejectsProjectName('dev triggers create')),
    triggersCmd$Enable.pipe(rejectsProjectName('dev triggers enable')),
    triggersCmd$Disable.pipe(rejectsProjectName('dev triggers disable')),
  ]),
  requireLogin
);
