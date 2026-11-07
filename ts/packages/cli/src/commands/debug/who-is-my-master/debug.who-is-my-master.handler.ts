import { Effect } from 'effect';
import { detectMasterFromHost } from 'src/services/master-detector';
import { TerminalUI } from 'src/services/terminal-ui';

/** Prints which agent, if any, drives this process. */
export const runDebugWhoIsMyMaster = () =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const master = yield* detectMasterFromHost;
    yield* ui.output(JSON.stringify({ master }, null, 2), { force: true });
  });
