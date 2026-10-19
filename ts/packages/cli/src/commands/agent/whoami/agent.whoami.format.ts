import {
  AGENT_SUMMARY_NOTE_TITLE,
  agentSummaryLines,
  type SafeAgentSummary,
} from 'src/services/agents';

/** The note body `composio agent whoami` prints on stderr. */
export const formatAgentWhoamiNote = (summary: SafeAgentSummary) =>
  [...agentSummaryLines(summary), `Claimed By: ${summary.claimed_by ?? 'not claimed'}`].join('\n');

/** The stdout payload of `composio agent whoami`: the identity summary, without any key. */
export const formatAgentWhoamiJson = (summary: SafeAgentSummary) => JSON.stringify(summary);
