import { Effect } from 'effect';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import {
  AGENT_SUMMARY_NOTE_TITLE,
  fetchAgentWhoami,
  resolveStoredAgentKey,
  safeAgentSummary,
  writeStoredAgentIdentity,
} from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';
import { formatAgentWhoamiJson, formatAgentWhoamiNote } from './agent.whoami.format';

/**
 * Refreshes the stored agent identity from the agents API, saves it, and prints its summary.
 * A missing or human login is reported by `handleAgentAuthError` and exits 1.
 */
export const runAgentWhoami = () =>
  handleAgentAuthError(
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const agentKey = yield* resolveStoredAgentKey;
      const identity = yield* fetchAgentWhoami(agentKey);
      const saved = yield* writeStoredAgentIdentity(identity);
      const summary = safeAgentSummary(saved);

      yield* ui.note(formatAgentWhoamiNote(summary), AGENT_SUMMARY_NOTE_TITLE);
      yield* ui.output(formatAgentWhoamiJson(summary));
    })
  );
