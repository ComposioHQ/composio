import { requireLogin } from 'src/effects/require-auth';
import { Command } from 'effect/cli';
import { rejectsSharedFlags } from 'src/commands/surface';
import { triggersCmd$Info } from './info/triggers.info.cmd';
import { triggersCmd$List } from './list/triggers.list.cmd';
import { triggersCmd$Status } from './status/triggers.status.cmd';
import { triggersCmd$Create } from './create/triggers.create.cmd';
import { triggersCmd$Enable } from './enable/triggers.enable.cmd';
import { triggersCmd$Disable } from './disable/triggers.disable.cmd';
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
    triggersCmd$List.pipe(rejectsSharedFlags('dev triggers list')),
    triggersCmd$Info.pipe(rejectsSharedFlags('dev triggers info')),
    triggersCmd$Status.pipe(rejectsSharedFlags('dev triggers status')),
    triggersCmd$Create.pipe(rejectsSharedFlags('dev triggers create', ['--project-name'])),
    triggersCmd$Enable.pipe(rejectsSharedFlags('dev triggers enable')),
    triggersCmd$Disable.pipe(rejectsSharedFlags('dev triggers disable')),
  ]),
  requireLogin
);
