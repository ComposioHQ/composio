import { requireLogin } from 'src/effects/require-auth';
import { Command } from 'effect/cli';
import { triggersCmd$Info } from './info/triggers.info.cmd';
import { triggersCmd$List } from './list/triggers.list.cmd';

export const rootTriggersCmd = Command.make('triggers').pipe(
  Command.withDescription('Browse and inspect trigger types before creating subscriptions.'),
  Command.withSubcommands([triggersCmd$List, triggersCmd$Info]),
  requireLogin
);
