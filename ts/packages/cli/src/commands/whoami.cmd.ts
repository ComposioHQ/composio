import { Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { getSessionInfoByUserApiKey } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { commandHintStep } from 'src/services/command-hints';

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
          onSome: apiKey =>
            Effect.gen(function* () {
              const defaultOrgId = Option.getOrUndefined(ctx.data.orgId);
              const testUserId = Option.getOrUndefined(ctx.data.testUserId);
              const sessionInfo = yield* getSessionInfoByUserApiKey({
                baseURL: ctx.data.baseURL,
                userApiKey: apiKey,
              }).pipe(Effect.option);
              const email = Option.map(sessionInfo, info => info.org_member.email).pipe(
                Option.getOrUndefined
              );
              const orgName = Option.map(sessionInfo, info => info.project.org.name).pipe(
                Option.getOrUndefined
              );

              yield* ui.note(
                [
                  `Email: ${email ?? 'unknown'}`,
                  `Default Org: ${orgName ?? 'unknown'}`,
                  `Default Org ID: ${defaultOrgId ?? 'not set'}`,
                  `Test User ID: ${testUserId ?? 'not set'}`,
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
                  email: email ?? null,
                  default_org_name: orgName ?? null,
                  default_org_id: defaultOrgId ?? null,
                  test_user_id: testUserId ?? null,
                })
              );
            }),
        })
      );
    })
  )
);
