import { withCommandMeta } from 'src/invocation/command-identity';
import { Command } from 'effect/cli';
import { NO_SHARED_FLAGS } from 'src/commands/surface';
import { triggersCmd$Info } from './info/triggers.info.cmd';
import { triggersCmd$List } from './list/triggers.list.cmd';
import { triggersCmd$Status } from './status/triggers.status.cmd';
import { triggersCmd$Create } from './create/triggers.create.cmd';
import { triggersCmd$Enable } from './enable/triggers.enable.cmd';
import { triggersCmd$Disable } from './disable/triggers.disable.cmd';
import { triggersCmd$Listen } from './commands/triggers.listen.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

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
  withRegisteredSubcommands([
    triggersCmd$Listen,
    triggersCmd$List.pipe(withCommandMeta({ sharedFlags: NO_SHARED_FLAGS })),
    triggersCmd$Info.pipe(withCommandMeta({ sharedFlags: NO_SHARED_FLAGS })),
    triggersCmd$Status.pipe(withCommandMeta({ sharedFlags: NO_SHARED_FLAGS })),
    triggersCmd$Create.pipe(withCommandMeta({ sharedFlags: { projectName: false } })),
    triggersCmd$Enable.pipe(withCommandMeta({ sharedFlags: NO_SHARED_FLAGS })),
    triggersCmd$Disable.pipe(withCommandMeta({ sharedFlags: NO_SHARED_FLAGS })),
  ]),
  withCommandMeta({ requiresLogin: true })
);
