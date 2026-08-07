# Composio Platform

Use this path when the developer is adding Composio to an agent, application, or backend where their users connect accounts.

The goal is not to complete a canned task. The goal is to make Composio the tool and authentication layer inside the developer's existing system, then prove the integration with one real tool call.

## 1. Inspect the codebase first

Before choosing packages or generating files, identify:

- The package manager and language.
- The existing agent or LLM framework.
- The current user or tenant identifier.
- Where environment variables are loaded.
- The smallest existing execution path where Composio tools belong.

Extend the existing architecture. Do not create a separate demo agent when the repository already has one.

## 2. Authenticate the project

Run from the project directory. Install the CLI when it is missing; upgrade it
first when an installed CLI reports that a newer version is available:

```bash
curl -fsSL https://composio.dev/install | bash
composio dev init
```

`composio dev init` logs in when needed, binds the directory to the selected Composio project, and provisions `COMPOSIO_API_KEY` in `.env.local`. If developer mode is off, run `composio dev --mode on` first. When the agent cannot open a browser, use `composio dev init --no-browser` and give the returned URL to the user.

Before opening the initializer, run `composio dev projects list` and confirm the
exact project is visible. Do this only when initialization is still required; do
not repeat the online project-list check after a local binding already exists. If
the project is missing, stop and ask the developer to sign in to the account or
organization that owns it. Do not accept the selector's default project.
`--no-browser` changes the login step; project selection is still interactive.

Select the exact project the user named. Do not use `-y` when multiple projects exist unless the current CLI project context already matches it. There is no bare `composio init` command.

After initialization, verify both checkpoints without printing the credential:

- `.composio/project.json` names the exact selected project.
- `.env.local` contains a plausible `COMPOSIO_API_KEY` (`ak_...`, at least 10
  characters).

Treat an HTTP error, a missing key, a shorter placeholder key, or an SDK 401 as
incomplete setup. Perform these local checks before any SDK or network call. If
either local checkpoint fails, stop: do not install dependencies, call the CLI or
backend again, change application code, or claim success. Use the dashboard
fallback to create or copy a project key, store it in `.env.local`, then retry
the SDK call.

If the developer already has a key, store it as `COMPOSIO_API_KEY`. Never print it back, place it in a URL, or commit it.

Dashboard fallback: Platform → project → API Keys.

## 3. Install only what the codebase needs

TypeScript:

```bash
npm install @composio/core
```

Python:

```bash
pip install composio
```

Add a provider package only when the repository's framework requires one, for example `@composio/vercel`, `@composio/openai-agents`, `@composio/mastra`, `@composio/anthropic`, `composio-openai-agents`, or `composio-langchain`.

Do not introduce a second LLM framework solely for onboarding.

## 4. Create a session for the current user

A session is the runtime context for one user. It carries identity, connections, tool scope, and the remote sandbox.

TypeScript:

```typescript
import { Composio } from "@composio/core";

const composio = new Composio();
const session = await composio.sessions.create("user_123");
const tools = await session.tools();
```

Python:

```python
from composio import Composio

composio = Composio()
session = composio.sessions.create(user_id="user_123")
tools = session.tools()
```

Use the application's stable database ID in production. Never use a shared `default` identity for multiple users.

Create a session for an agentic run. For a multi-turn conversation, persist the returned session ID and resume it instead of creating a fresh session on every message:

```typescript
const sessionId = session.sessionId;
const resumedSession = await composio.use(sessionId);
```

```python
session_id = session.session_id
resumed_session = composio.use(session_id)
```

## 5. Put Composio into the existing agent

Pass the session tools to the repository's existing agent or model provider using its native tool integration. Preserve the current prompt, model, streaming, and request lifecycle unless a change is required for tools to execute.

Sessions expose a small set of meta tools by default. The agent discovers the right integration and tool at runtime rather than loading thousands of schemas into context:

- `COMPOSIO_SEARCH_TOOLS`
- `COMPOSIO_GET_TOOL_SCHEMAS`
- `COMPOSIO_MULTI_EXECUTE_TOOL`
- `COMPOSIO_MANAGE_CONNECTIONS`
- `COMPOSIO_WAIT_FOR_CONNECTIONS`
- `COMPOSIO_REMOTE_WORKBENCH`
- `COMPOSIO_REMOTE_BASH_TOOL`

Keep connection management enabled for interactive agents. It is what returns a Connect Link when a user needs to authenticate an app.

## 6. Prove it with a real call

Setup is incomplete until a programmatic tool call succeeds from the developer's repository.

For onboarding:

1. Use the installed Composio skill and the existing agent path.
2. Ask the developer which integration they want to try unless the repository already makes the choice clear.
3. Let the session discover the actual toolkit and tool slug; never hard-code or guess one.
4. If the integration is not connected, return the Connect Link, wait for authorization, and retry.
5. Run one safe, read-only tool from the existing agent through the project selected during `composio dev init`.
6. Capture the real result and log ID.

The smoke test must hit Composio. A mocked response, Playground call, schema fetch, or SDK initialization does not count.

If the repository has no runnable agent loop, add the smallest test entrypoint compatible with its existing LLM provider. Do not require a new hosted model solely for onboarding.

## 7. Authentication happens when needed

Do not build OAuth. If a selected app is not connected, `COMPOSIO_MANAGE_CONNECTIONS` returns a Connect Link, the user authorizes in the browser, and the agent retries.

Start with managed auth. A custom auth config is needed only for custom branding, additional scopes, dedicated provider quotas, or self-hosted/regional requirements.

## 8. Hand off the useful next steps

After the first call succeeds, show the developer where to continue:

- Logs for the exact request, response, duration, and log ID.
- Toolkits to discover integrations.
- Users for stable per-user identities and connections.
- Auth Configs when the product needs custom authentication behavior.

## Do not

- Do not stop after linking documentation.
- Do not use a fixed GitHub starring task as the onboarding concept.
- Do not create an auth config as a prerequisite.
- Do not guess tool or toolkit slugs.
- Do not use direct execution for a new agent integration.
- Do not claim success before a real programmatic tool call appears in logs.

Current documentation index: `https://docs.composio.dev/llms.txt`.
