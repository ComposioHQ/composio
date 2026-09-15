## Proxy execute (Legacy) requires an explicitly allowed Project API key

Use **Session tool execution** for new session-based integrations. The older direct Proxy Execute API requires **Proxy execute (Legacy)**. If an existing integration is denied access to that API, check the key's permissions before debugging the provider connection.

## Tool Router session creation requires Session management write access

For newly created scoped Project API keys, creating a session through Python's `composio.sessions.create(...)` or `POST /api/v3.1/tool_router/session` requires the Session management permission with write or read/write access.

A key can successfully call `GET /api/v3.1/toolkits` with Toolkits read access and still be unable to create a session. The SDK can surface a scoped-permission denial as a generic 401 `Invalid API key`.

Create a new Project API key with Session management set to Write only, then retry session creation. Choose Read and write if you also need to retrieve sessions.

## Tool execution (Legacy) requires write access

For a newly created scoped Project API key, `composio.tools.execute()` and the direct tool execution API require Tool execution (Legacy) set to Write. A key without that permission can surface a generic 401 `Invalid API key` even when the key exists and is active.

Create a correctly scoped Project API key or use an appropriate full-access Project API key, then retry.

## Session tool execution requires write access

Set **Session tool execution** to Write to search and execute tools through a session or its MCP server. This permission also covers session proxy requests and allows the key to invoke any tool exposed by the session-linked MCP server.

## Legacy MCP routes require MCP (Legacy) access

Use MCP (Legacy) read or write access to view or manage MCP servers and instances. Connecting to an MCP transport requires MCP (Legacy) write access and grants every capability exposed by that server.

See [Scoped Project API Key](/reference/authenticating-to-composio/project-api-key-permissions) for the complete permission and route reference.
