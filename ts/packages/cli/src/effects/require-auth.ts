import { Effect } from 'effect';
import { notLoggedIn } from 'src/commands/errors';
import { ComposioUserContext } from 'src/services/user-context';

/**
 * Fails with `NotLoggedInError` when `~/.composio` holds no API key. A command never calls it
 * itself: it declares `withCommandMeta({ requiresLogin: true })`, and the registration that runs
 * it checks the login right after the command began (`src/commands/registration.ts`).
 */
export const assertLoggedIn = Effect.gen(function* () {
  const ctx = yield* ComposioUserContext;
  if (!ctx.isLoggedIn()) {
    return yield* notLoggedIn();
  }
});
