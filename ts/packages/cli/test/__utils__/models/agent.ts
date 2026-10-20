import type { AgentIdentity } from 'src/services/agents';

/**
 * A READY agent identity as `agents.composio.dev` returns it from `/api/signup` and
 * `/api/whoami`. Suites override only the fields their scenario is about.
 */
export const makeAgentIdentity = (overrides: Partial<AgentIdentity> = {}): AgentIdentity => ({
  status: 'READY',
  slug: 'test-agent',
  email: 'test-agent@agent.composio.ai',
  composio_agent_key: 'cak_test_agent',
  composio: {
    member_id: 'mem_agent',
    org_id: 'org_agent',
    project_id: 'proj_agent',
    user_api_key: 'uak_agent',
  },
  ...overrides,
});

/** A JSON response from the agents API, as the stubbed `fetch` answers it. */
export const agentsJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
