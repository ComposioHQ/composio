import { Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { redact } from 'src/ui/redact';

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
      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;

      yield* ctx.data.apiKey.pipe(
        Option.match({
          onNone: () => ui.log.warn('You are not logged in yet. Please run `composio login`.'),
          onSome: apiKey =>
            Effect.gen(function* () {
              const redactedApiKey = redact({ value: apiKey, prefix: 'ak_' });

              yield* ui.note(redactedApiKey, 'API Key');
              yield* ui.output(apiKey);
            }),
        })
      );
    })
  )
);
