import { Effect } from 'effect';
import { renderCommandHintGraph } from 'src/services/command-hints';
import { TerminalUI } from 'src/services/terminal-ui';

/** Prints the command-hint graph as indented JSON. */
export const runDebugGenerateGraph = () =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    yield* ui.output(JSON.stringify(renderCommandHintGraph(), null, 2), { force: true });
  });
