import type { SafeAgentSummary } from 'src/services/agents';

/** The title of the note `composio agent whoami` prints. */
export const AGENT_WHOAMI_NOTE_TITLE = 'Composio Agent';

/** The note body `composio agent whoami` prints on stderr. */
export const formatAgentWhoamiNote = (summary: SafeAgentSummary) =>
  [
    `Type: agent`,
    `Status: ${summary.status}`,
    `Email: ${summary.email ?? 'unknown'}`,
    `Slug: ${summary.slug ?? 'unknown'}`,
    `Current Org ID: ${summary.org_id ?? 'pending'}`,
    `Project ID: ${summary.project_id ?? 'pending'}`,
    `Claimed By: ${summary.claimed_by ?? 'not claimed'}`,
  ].join('\n');

/** The stdout payload of `composio agent whoami`: the identity summary, without any key. */
export const formatAgentWhoamiJson = (summary: SafeAgentSummary) => JSON.stringify(summary);
