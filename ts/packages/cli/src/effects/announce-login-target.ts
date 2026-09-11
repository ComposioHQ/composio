import { Effect } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { type BackendTarget, backendHost, isProductionBackend } from 'src/utils/backend-resolution';

/**
 * Name the backend a login is about to target when it is not production, so a
 * staging or custom-host login never happens silently.
 */
export const announceLoginTarget = (target: BackendTarget) =>
  Effect.gen(function* () {
    if (isProductionBackend(target.baseURL)) return;
    const ui = yield* TerminalUI;
    yield* ui.log.info(`Logging in to ${backendHost(target.baseURL)}`);
  });
