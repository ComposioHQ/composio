import { Effect, Option } from 'effect';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';

/**
 * Checks that the user is authenticated. Returns `true` if an API key is present,
 * or logs a warning and returns `false` if not.
 *
 * Usage in commands:
 * ```ts
 * if (!(yield* requireAuth)) return;
 * ```
 */
export const requireAuth = Effect.gen(function* () {
  const ctx = yield* ComposioUserContext;

  if (Option.isNone(ctx.data.apiKey)) {
    const ui = yield* TerminalUI;
    yield* ui.log.warn('You are not logged in yet. Please run `composio login`.');
    return false as const;
  }

  return true as const;
});
