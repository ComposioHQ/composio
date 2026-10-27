import { requireLogin } from 'src/effects/require-auth';
import { Command } from 'effect/cli';
import { triggersCmd$Info } from './info/triggers.info.cmd';
import { triggersCmd$List } from './list/triggers.list.cmd';
import { withRegisteredSubcommands } from 'src/commands/registration';

export const rootTriggersCmd = Command.make('triggers').pipe(
  Command.withDescription('Browse and inspect trigger types before creating subscriptions.'),
  withRegisteredSubcommands([triggersCmd$List, triggersCmd$Info]),
  requireLogin
);
