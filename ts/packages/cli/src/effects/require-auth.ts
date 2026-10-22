import { Effect } from 'effect';
import { Command } from 'effect/cli';
import { notLoggedIn } from 'src/commands/errors';
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
 * Pipe it after `Command.withSubcommands`, since it wraps the handler that exists when it is
 * applied. The handler then never checks `apiKey` or prints a login hint.
 */
export const requireLogin = <const Name extends string, Input, ContextInput, E, R>(
  self: Command.Command<Name, Input, ContextInput, E, R>
) => Command.provideEffectDiscard(self, assertLoggedIn);
