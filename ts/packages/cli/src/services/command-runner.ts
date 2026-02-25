import { Command } from '@effect/platform';
import { Effect } from 'effect';

export class CommandRunner extends Effect.Service<CommandRunner>()('services/CommandRunner', {
  sync: () => ({
    run: (command: Command.Command) => Command.exitCode(command),
  }),
  dependencies: [],
}) {}
