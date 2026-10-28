import { Effect } from 'effect';
import { notLoggedIn } from 'src/commands/errors';
import { withCommandMeta } from 'src/invocation/command-identity';
import { ComposioUserContext } from 'src/services/user-context';

/** Fails with `NotLoggedInError` when `~/.composio` holds no API key. */
export const assertLoggedIn = Effect.gen(function* () {
  const ctx = yield* ComposioUserContext;
  if (!ctx.isLoggedIn()) {
    return yield* notLoggedIn();
  }
});

/**
 * Makes a command, or a group entry and every subcommand under it, require a logged-in user.
 * It declares `requiresLogin` in the command's `CommandMeta`; the registration that runs the
 * command checks the login right after recording the command's identity
 * (`src/commands/registration.ts`), so `NotLoggedInError` names the command the user ran. The
 * handler then never checks `apiKey` or prints a login hint.
 */
export const requireLogin = withCommandMeta({ requiresLogin: true });
