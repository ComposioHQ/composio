import { Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { commandHintStep } from 'src/services/command-hints';
import { resolveWhoamiInfo } from 'src/services/whoami';

/**
 * CLI command to display your account information.
 * Never prints or exposes API keys.
 *
 * @example
 * ```bash
 * composio whoami
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
          onSome: () =>
            Effect.gen(function* () {
              const info = yield* resolveWhoamiInfo;

              yield* ui.note(
                [
                  `Email: ${info.email ?? 'unknown'}`,
                  `Default Org: ${info.defaultOrgName ?? 'unknown'}`,
                  `Default Org ID: ${info.defaultOrgId ?? 'not set'}`,
                  `Test User ID: ${info.testUserId ?? 'not set'}`,
                ].join('\n'),
                'Global User Context'
              );
              yield* ui.log.step(
                [
                  commandHintStep('To switch orgs', 'root.orgs.switch'),
                  commandHintStep('To set up developer project context', 'dev.init'),
                ].join('\n\n')
              );
              yield* ui.output(
                JSON.stringify({
                  email: info.email ?? null,
                  default_org_name: info.defaultOrgName ?? null,
                  default_org_id: info.defaultOrgId ?? null,
                  test_user_id: info.testUserId ?? null,
                })
              );
            }),
        })
      );
    })
  )
);
