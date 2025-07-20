import { Command } from '@effect/cli';
import { Effect, Console, Option } from 'effect';
import { ComposioUserContext } from 'src/services/user-context';

/**
 * CLI command to display your account information.
 *
 * @example
 * ```bash
 * composio whoami <command>
 * ```
 */
export const whoamiCmd = Command.make('whoami', {}).pipe(
  Command.withDescription('Display your account information.'),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const ctx = yield* ComposioUserContext;

      const message = ctx.data.apiKey.pipe(
        Option.match({
          onNone: () => 'You are not logged in yet. Please run `composio login`.',
          onSome: apiKey => `API KEY: ${apiKey}`,
        })
      );

      yield* Console.log(message);
    })
  )
);
