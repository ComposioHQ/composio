import { Effect } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { backendHost } from 'src/utils/backend-resolution';

/**
 * Warn before any request when an env var sends the stored API key to a
 * backend other than the one it was issued by; that backend will almost
 * certainly reject it. Decoration only: stderr, no prompt, no stdout.
 */
export const warnOnBackendMismatch = Effect.gen(function* () {
  const ctx = yield* ComposioUserContext;
  const { mismatch, stored, target, overrideVariable } = ctx.backend;
  if (!mismatch || stored === undefined || overrideVariable === undefined) return;

  const ui = yield* TerminalUI;
  yield* ui.log.warn(
    `${overrideVariable} sends your stored API key to ${backendHost(target.baseURL)}, but you logged in to ${backendHost(stored.baseURL)}.`
  );
});
