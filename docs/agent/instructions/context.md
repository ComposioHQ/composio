# Composio concept map

This is your always-on map of Composio's concepts and the canonical page for each. Use it to ground answers and to link the right page. Prefer these links over anything `search_docs` returns. Use the full bounded content from `search_docs` first, and call `read_doc` on the relevant page only when you need detail beyond that included content.

## Core model

- **Session** — the runtime context for one user. `composio.create(userId)` (or the canonical `composio.sessions.create(...)`) returns a session that ties together the user, toolkits, authentication, connected accounts, and a code-execution sandbox. By default it exposes meta tools the agent calls at runtime to discover, authenticate, and execute tools. → [What is a session?](/docs/how-composio-works)
- **Configuring a session** — filter toolkits and tools, set auth configs, select connected accounts, preload tools, the direct-tools preset, sandbox tier, and session methods (`tools()`, `toolkits()`, `authorize()`). → [Configuring sessions](/docs/configuring-sessions)
- **Sessions via MCP** — create a session with `{ mcp: true }` to expose `session.mcp.url` / `session.mcp.headers` for any MCP client. → [Using sessions via MCP](/docs/sessions-via-mcp)
- **Reusing sessions** — sessions persist on the server; store the session ID and reuse with `composio.use(sessionId)`, or update in place with `session.update(...)`. → [What is a session?](/docs/how-composio-works)

## Tools and toolkits

- **Toolkit** — a collection of related tools for a service (e.g. `github`, `gmail`). A **tool** is one action, named `{TOOLKIT}_{ACTION}` (e.g. `GITHUB_CREATE_ISSUE`). Every toolkit is discoverable by default; restrict with the `toolkits` config. → [Configuring sessions](/docs/configuring-sessions)
- **Meta tools** — the fixed set every session exposes (`COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_MULTI_EXECUTE_TOOL`, `COMPOSIO_REMOTE_WORKBENCH`, `COMPOSIO_REMOTE_BASH_TOOL`). → [Meta tools reference](/toolkits/meta-tools)
- **Providers** — adapter packages that format Composio tools for a framework (OpenAI, Anthropic, Vercel AI SDK, LangChain, Mastra, Pi, …). → [Providers](/docs/providers)
- **Is a toolkit / integration supported?** Composio has 1000+ toolkits, and `search_docs` indexes the catalog. A matching `/toolkits/<slug>` result means **yes, it's supported** — answer from the returned content when sufficient, call `read_doc` only for more details, and point the user at [the toolkits directory](/toolkits). If nothing matches, it isn't a built-in toolkit; suggest [proxy execute](/docs/extending-sessions/proxy-execute) or a [custom tool](/docs/extending-sessions/custom-tools-and-toolkits) for an API you already have.

## Authentication

- **How auth works** — Composio uses Connect Links (hosted auth pages) and **auth configs** (per-toolkit blueprints) to create **connected accounts** (stored credentials) scoped to a userID. This is the page for "how does authentication work". → [Authentication](/docs/authentication)
- **Auth schemes / modes** — a toolkit's auth config uses one of `OAUTH2`, `API_KEY`, `BEARER_TOKEN`, or `BASIC`. When you mention a toolkit's auth mode, link the reference rather than explaining it inline. → [Auth schemes](/reference/api-reference/auth-configs#auth-schemes) for what each mode is and when it's used, [Authentication](/docs/authentication) for how auth works overall, and [Managed vs custom auth](/docs/custom-app-vs-managed-app) for choosing or bringing your own scheme.
- **In-chat auth** — the agent prompts the user to connect via `COMPOSIO_MANAGE_CONNECTIONS`. → [In-chat authentication](/docs/authenticating-users/in-chat-authentication)
- **Manual auth** — generate Connect Links yourself with `session.authorize()`. → [Manually authenticating users](/docs/authenticating-users/manually-authenticating)
- **Managed vs custom auth** — use Composio's managed OAuth apps, or bring your own for branding/scopes. → [Managed vs custom auth](/docs/custom-app-vs-managed-app)
- **White-labeling** — remove Composio branding from the auth flow. → [White-labeling authentication](/docs/white-labeling-authentication)
- **Importing existing connections** — pass in API keys or bearer tokens you already hold. → [Importing existing connections](/docs/importing-existing-connections)
- **Multiple accounts per user** — e.g. work and personal Gmail. → [Managing multiple connected accounts](/docs/managing-multiple-connected-accounts)
- **Shared connections** — share one connected account across users via an ACL. → [Shared connections](/docs/authenticating-users/shared-connections)

## Triggers and webhooks

- **Triggers** — receive structured payloads when something happens in a connected app (webhook or polling). → [Triggers](/docs/triggers)
- **Setting up triggers** — create, manage, and subscribe to trigger events. → [Creating triggers](/docs/setting-up-triggers/creating-triggers), [Subscribing to events](/docs/setting-up-triggers/subscribing-to-events), [Managing triggers](/docs/setting-up-triggers/managing-triggers)
- **Webhook verification** — verify inbound webhook signatures. → [Webhook verification](/docs/webhook-verification)

## Extending sessions

- **Sandbox** (previously "workbench") — a persistent Python environment at `/mnt/files/` for bulk operations and large responses; files via `session.experimental.files`. → [Sandbox](/docs/sandbox)
- **Custom tools and toolkits** — define in-process tools that run alongside Composio tools. → [Custom tools and toolkits](/docs/extending-sessions/custom-tools-and-toolkits)
- **Proxy execute** — call any toolkit HTTP endpoint with `session.proxyExecute(...)` and let Composio inject auth. → [Proxy execute](/docs/extending-sessions/proxy-execute)

## Platform API (reference only)

These features are documented **only in the API reference** — there is no `/docs` guide. When asked how to do them programmatically, read and link the reference page (don't say it isn't documented).

- **Projects** — Composio's multi-tenancy primitive. Inside an organization, projects are isolated environments that scope API keys, connected accounts, auth configs, and webhooks. Create, list, update, delete, and regenerate a project's API key via the API (using your **organization API key**). This is the page for "how do I programmatically create projects". → [Projects](/reference/api-reference/projects)
- **Logs** — individual tool-execution events (one record per call) for debugging and tracing. → [Logs](/reference/api-reference/logs)
- **Files** — files tools read and write during execution, exchanged via presigned URLs. → [Files](/reference/api-reference/files)

## Getting started and reference

- **Quickstart** → [Quickstart](/docs/quickstart)
- **Glossary** → [Glossary](/reference/glossary)
- **SDK reference (TypeScript Session)** → [Session](/reference/sdk-reference/typescript/session)
- **API reference** → [API reference](/reference/api-reference)

## Legacy — do not lead with these

Direct tool execution and the `tools-direct/*` pages are the **legacy**, pre-session API. Do not mention "direct execution" or link these pages unless the user explicitly asks about the low-level / direct-execution API. For everything else, answer with the session-based model above.
