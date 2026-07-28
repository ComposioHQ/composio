# CLI agent sign-in e2e (PRDE-1138)

Asserts the headless agent onboarding contract:

- `composio login --agent` takes an unattended agent from nothing to an
  authenticated CLI (mocked `agents.composio.dev` via
  `COMPOSIO_AGENTS_BASE_URL`), verified with a follow-up `composio whoami`.
- A plain piped `composio login` prints the OAuth URL + poll instructions,
  offers the `composio login --agent` path for unattended agents, and never
  auto-creates an account (guardrail: humans in pipes are not signed up).
- A stored READY agent identity (`agent.json`) lets plain headless
  `composio login` complete unattended by reuse, without signup.

All network surfaces are mocked by
`ts/packages/cli/scripts/mock-agents-server.ts`; no real accounts are created.
