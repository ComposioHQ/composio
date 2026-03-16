import { Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';

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
              const defaultOrgId = Option.getOrUndefined(ctx.data.orgId);
              const defaultProjectId = Option.getOrUndefined(ctx.data.projectId);
              const testUserId = Option.getOrUndefined(ctx.data.testUserId);

              yield* ui.note(
                [
                  `Default Org ID: ${defaultOrgId ?? 'not set'}`,
                  `Default Project ID: ${defaultProjectId ?? 'not set'}`,
                  `Test User ID: ${testUserId ?? 'not set'}`,
                ].join('\n'),
                'Global User Context'
              );
              yield* ui.log.step(
                [
                  'To switch orgs:\n> composio orgs switch',
                  'To get API keys:\n> composio init (in your project)',
                ].join('\n\n')
              );
              yield* ui.output(
                JSON.stringify({
                  default_org_id: defaultOrgId ?? null,
                  default_project_id: defaultProjectId ?? null,
                  test_user_id: testUserId ?? null,
                })
              );
            }),
        })
      );
    })
  )
);
