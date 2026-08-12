import { Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { getSessionInfoByUserApiKey } from 'src/services/composio-clients';
import { linkApolloIdentityForAnalytics } from 'src/analytics/dispatch';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { commandHintStep } from 'src/services/command-hints';
import { readStoredAgentIdentity } from 'src/services/agents';
import { getOrgEnhancedControlsStatus } from 'src/services/tool-permissions';

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
              const sessionInfo = yield* getSessionInfoByUserApiKey({
                baseURL: ctx.data.baseURL,
                userApiKey: apiKey,
                // Reflect the org selected via `composio orgs switch`, not the key's home org.
                orgId: Option.getOrUndefined(ctx.data.orgId),
              }).pipe(Effect.option);
              yield* Option.match(sessionInfo, {
                onNone: () => Effect.void,
                onSome: info => linkApolloIdentityForAnalytics(info.org_member.id, apiKey),
              });
              const email = Option.map(sessionInfo, info => info.org_member.email).pipe(
                Option.getOrUndefined
              );
              const orgName = Option.map(sessionInfo, info => info.project.org.name).pipe(
                Option.getOrUndefined
              );
              const enhancedControls = yield* Option.match(sessionInfo, {
                onNone: () => Effect.succeed(undefined),
                onSome: info =>
                  getOrgEnhancedControlsStatus({
                    orgId: info.project.org.id,
                    projectId: info.project.nano_id,
                  }),
              });
              const storedAgent = yield* readStoredAgentIdentity;
              const isStoredAgentKey = Option.match(storedAgent, {
                onNone: () => false,
                onSome: agent => agent.composio?.user_api_key === apiKey,
              });
              const accountType =
                isStoredAgentKey || email?.endsWith('@agent.composio.ai') ? 'agent' : 'human';

              yield* ui.note(
                [
                  `Type: ${accountType}`,
                  `Email: ${email ?? 'unknown'}`,
                  `Current Org: ${orgName ?? 'unknown'}`,
                  `Enhanced Controls: ${enhancedControls?.remoteEnabled ? 'on' : 'off'}`,
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
                  account_type: accountType,
                  email: email ?? null,
                  current_org_name: orgName ?? null,
                  enhanced_controls_enabled: enhancedControls?.remoteEnabled ?? null,
                })
              );
            }),
        })
      );
    })
  )
);
