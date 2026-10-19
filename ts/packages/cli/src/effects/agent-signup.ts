import { Effect } from 'effect';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import {
  AGENT_SUMMARY_NOTE_TITLE,
  agentSummaryLines,
  ensureAgentSignupAllowed,
  getOrSignupReadyAgent,
  loginWithAgentIdentity,
  safeAgentSummary,
  signupAgent,
} from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';

/** The flags `composio signup` and `composio agent signup` share. */
export type AgentSignupFlowParams = {
  readonly noWait: boolean;
  readonly noLogin: boolean;
  readonly force: boolean;
  /** The command the intro and the info line name. */
  readonly commandLabel?: string;
};

/**
 * Signs up (or reuses) a Composio agent identity and, unless `noWait` or `noLogin`, logs the
 * CLI in with it. Shared by `composio signup` and `composio agent signup`, which differ only in
 * `commandLabel`.
 */
export const runAgentSignupFlow = (params: AgentSignupFlowParams) =>
  handleAgentAuthError(
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const commandLabel = params.commandLabel ?? 'composio signup';

      yield* ensureAgentSignupAllowed;
      yield* ui.intro(commandLabel);
      yield* ui.log.info(
        `${commandLabel} signs you up as a Composio agent. This flow is fully non-interactive and does not open a browser.`
      );

      const identity = yield* params.noWait
        ? signupAgent({ wait: false })
        : getOrSignupReadyAgent({ force: params.force });
      const summary = safeAgentSummary(identity);

      yield* ui.note(
        [...agentSummaryLines(summary), `Agent key: stored in ~/.composio/agent.json`].join('\n'),
        AGENT_SUMMARY_NOTE_TITLE
      );

      if (!params.noWait && !params.noLogin) {
        yield* loginWithAgentIdentity(identity);
        yield* ui.log.success('Logged in with the Composio agent identity.');
      } else if (params.noWait) {
        yield* ui.log.info('Signup is pending. Run `composio agent whoami` to poll status.');
      }

      yield* ui.output(
        JSON.stringify({ ...summary, logged_in: !params.noWait && !params.noLogin })
      );
      yield* ui.outro('Agent setup complete.');
    })
  );
