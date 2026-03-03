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
              const defaultOrgId = Option.getOrUndefined(ctx.data.orgId);
              const defaultProjectId = Option.getOrUndefined(ctx.data.projectId);
              const testUserId = Option.getOrUndefined(ctx.data.testUserId);

              yield* ui.note(
                [
                  `Global User API Key: ${redactedApiKey}`,
                  `Default Org ID: ${defaultOrgId ?? 'not set'}`,
                  `Default Project ID: ${defaultProjectId ?? 'not set'}`,
                  `Test User ID: ${testUserId ?? 'not set'}`,
                ].join('\n'),
                'Global User Context'
              );
              yield* ui.output(
                JSON.stringify({
                  global_user_api_key: apiKey,
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
