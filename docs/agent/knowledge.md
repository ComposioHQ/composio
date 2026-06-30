# Composio knowledge base

Curated, searchable knowledge for the docs assistant. Each `## Heading (/url)`
section is indexed by `search_docs` and links its canonical page. Add entries
here to expose more answers to search without changing the docs themselves.

## Installing and getting started (/docs/quickstart)

Install the SDK with `npm install @composio/core` (TypeScript) or `pip install composio` (Python), set `COMPOSIO_API_KEY`, then create a session with `composio.create("user_123")`. The quickstart walks through creating a session, fetching tools for your framework via a provider, and running an agent.

## Choosing a provider (/docs/providers)

A provider adapts Composio tools into the shape your AI framework expects. Composio ships providers for OpenAI, the Anthropic SDK, the Vercel AI SDK, LangChain, Mastra, the Pi coding agent, and more. Pass a provider when constructing `Composio({ provider })`, then `session.tools()` returns tools formatted for that framework. You can also build a custom provider.

## userID best practices (/docs/how-composio-works)

The userID scopes connected accounts and tool executions and isolates users from each other. Use a stable identifier such as your database UUID or primary key. Avoid email addresses (they change) and never use `default` in production, since that exposes one user's connections to others.

## Native tools vs MCP (/docs/sessions-via-mcp)

By default a session gives your agent tools it calls directly through a provider package; this integrates with your framework and supports modifiers and custom tools. Creating a session with `{ mcp: true }` also exposes `session.mcp.url` and `session.mcp.headers` for any MCP-compatible client. MCP is more portable across clients, but modifiers and custom tools do not apply over the MCP surface.

## Sandbox files and the /mnt/files mount (/docs/sandbox)

The sandbox has a persistent file mount at `/mnt/files/` that survives sandbox restarts (changing the compute tier clears in-memory state but keeps the mount). Move files between your app and the mount with `session.experimental.files` (`upload`, `list`, `download`, `delete`). A `RemoteFile`'s `expiresAt` is the download-link expiry, not a file TTL, and there is no SDK call to create custom mounts.

## Reusing and updating sessions (/docs/how-composio-works)

Sessions persist on the server and do not expire. For a multi-turn conversation, store the session ID and reuse it with `composio.use(sessionId)` instead of calling `create()` again. You can also change a live session in place with `session.update({ toolkits, authConfigs, connectedAccounts })`.
