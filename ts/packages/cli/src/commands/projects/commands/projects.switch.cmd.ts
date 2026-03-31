import { Command } from '@effect/cli';
import { Effect } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';

export const projectsCmd$Switch = Command.make('switch', {}).pipe(
  Command.withDescription('Switch the developer project for this directory.'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      yield* ui.log.info(
        'Global developer project switching is no longer supported. Run `composio dev init` in a directory to bind it to a developer project.'
      );
    })
  )
);
