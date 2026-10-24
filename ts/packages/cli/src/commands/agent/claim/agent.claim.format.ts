import type { AgentClaimResponse } from 'src/services/agents';

/** The success line `composio agent claim` prints on stderr. */
export const claimInviteSentMessage = (email: string) =>
  `Sent Composio org claim invite to ${email}.`;

/**
 * The stdout payload of `composio agent claim`: the invite the agents API created, with the
 * requested `email` and an `invited` status when the response leaves them out.
 */
export const formatAgentClaimJson = (result: AgentClaimResponse, requestedEmail: string) =>
  JSON.stringify({
    status: result.status ?? 'invited',
    email: result.email ?? requestedEmail,
    org_id: result.org_id ?? null,
    invite_code: result.invite_code ?? null,
  });
