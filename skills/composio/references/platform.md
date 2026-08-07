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

## 2. Require the existing project credential

The dashboard Getting Started Step 1 supplies the one project credential as `COMPOSIO_API_KEY=ak_*`. Use that credential from `.env.local`, the current process environment, or the repository's existing secret mechanism.

Platform onboarding never creates, rotates, or replaces an API key. Never print the value, place it in a command or URL, copy it to another file unnecessarily, or ask the developer to paste it into chat. The key already identifies the dashboard project; do not select or bind a project separately.

Complete this preflight before installing packages or changing application code:

1. Find how the repository already loads environment variables or secrets.
2. Check for `COMPOSIO_API_KEY` without opening, echoing, or logging the value.
3. Require the value to begin with `ak_`.
4. Reject values containing `*`, mask glyphs, ellipses, angle-bracket templates, or placeholder words such as `example`, `placeholder`, `replace`, or `your_key`.
5. When the credential is in a file, verify that the containing file is ignored by source control. Check the path only; never print the matching line.

These checks catch missing, masked, or placeholder values. They do not prove that a key is authentic, and key length is not validation. The first SDK request is the network validation.

If the credential is missing, masked, placeholder-like, or stored in a tracked file, hard stop before package installation or app-code changes. Direct the developer to Platform → project → Getting Started → Step 1, then resume only after the repository's normal secret-loading path supplies an unmasked value. Do not accept the key through chat.

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

## 4. Preserve the current user identity

A session is the runtime context for one user. It carries identity, connections, tool scope, and the remote sandbox.

Trace the application's current authenticated user or tenant ID before creating a session. Pass that same stable ID to Composio. Do not add a parallel user system, replace an existing session model, or use one shared placeholder identity for multiple users.

TypeScript:

```typescript
import { Composio } from "@composio/core";

const composio = new Composio();
const session = await composio.sessions.create(existingUserId);
const tools = await session.tools();
```

Python:

```python
from composio import Composio

composio = Composio()
session = composio.sessions.create(user_id=existing_user_id)
tools = session.tools()
```

Do not pass the API key inline. The SDK reads the existing `COMPOSIO_API_KEY`. If this first SDK request returns a Composio API/session 401, stop and follow [Errors and provider gotchas](errors.md); do not modify packages or application code to work around it.

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
3. Let the session discover the actual toolkit and tool slug for that integration; never hard-code or guess one.
4. If the integration is not connected for the existing user ID, return the Connect Link, wait for authorization, and retry.
5. Execute one safe, read-only tool through the existing agent.
6. Require a real result payload and a non-empty `logId` (`log_id` in Python).

The proof must hit Composio and the selected provider. A mock, Playground call, tool search, schema fetch, session creation, or Connect Link alone does not count as success.

If the repository has no runnable agent loop, add the smallest test entrypoint compatible with its existing LLM provider. Do not require a new hosted model solely for onboarding.

## 7. Authentication happens when needed

Do not build OAuth. If a selected app is not connected, `COMPOSIO_MANAGE_CONNECTIONS` returns a Connect Link, the user authorizes in the browser, and the agent retries.

Start with managed auth. A custom auth config is needed only for custom branding, additional scopes, dedicated provider quotas, or self-hosted/regional requirements.

## 8. Hand off the useful next steps

After the first call succeeds, report:

- Where Composio was added in the existing codebase.
- Which existing application identity supplies Composio's `userId`, and how the resulting session ID is persisted or resumed.
- The integration and exact read-only tool used.
- A safe summary of the actual result and the Composio log ID.
- Where to continue: Platform dashboard → Logs for the request/response, Users for identity and connections, and Toolkits for integrations.

Link the developer to the relevant framework guide from `https://docs.composio.dev/docs/providers` and the selected integration guide at `https://docs.composio.dev/toolkits/<toolkit>`.

## Do not

- Do not stop after linking documentation.
- Do not substitute a canned integration task for the developer's choice or repository context.
- Do not create an auth config as a prerequisite.
- Do not guess tool or toolkit slugs.
- Do not use direct execution for a new agent integration.
- Do not claim success before a real programmatic tool call returns a result and log ID.

Current documentation index: `https://docs.composio.dev/llms.txt`.
