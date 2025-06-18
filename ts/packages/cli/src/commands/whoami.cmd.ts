import { Command } from '@effect/cli';
import { Effect, Console } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';

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
      const apiKey = yield* APP_CONFIG['API_KEY'];
      yield* Console.log(`API KEY: ${apiKey}`);
    })
  )
);
