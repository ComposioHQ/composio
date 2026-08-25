## Proxy execute (Legacy) requires an explicitly allowed Project API key

Create a scoped Project API key in the Dashboard and enable **Proxy execute (Legacy)**
during key creation before calling the v3.1 Proxy Execute API. If a request is
denied, verify the key's scope before debugging the provider connection. Use a
fresh request ID from the correctly scoped key when contacting Composio support is still necessary.

## Tool Router session creation requires Session management write access

For newly created scoped Project API keys, creating a session through `composio.sessions.create(...)` or `POST /api/v3.1/tool_router/session` requires the Session management permission with write or read/write access.

A key can successfully call `GET /api/v3.1/toolkits` with Toolkits read access and still be unable to create a session. The SDK can surface a scoped-permission denial as a generic 401 `Invalid API key`.

Create a new Project API key with Session management set to Read and write, or use an appropriate full-access Project API key, then retry session creation. Existing keys with the legacy Sessions permission continue to work without changes.

## Tool execution (Legacy) requires write access

For a newly created scoped Project API key, `composio.tools.execute()` and the direct tool execution API require Tool execution (Legacy) set to Write. A key without that permission can surface a generic 401 `Invalid API key` even when the key exists and is active.

Create a correctly scoped Project API key or use an appropriate full-access Project API key, then retry.

## Session tool execution requires write access

Session search, tool execution, proxy execution, and session-linked MCP access require Session tool execution set to Write. Session proxy execution also accepts Proxy execute (Legacy), so existing Proxy execute keys keep working. A key with Session tool execution can invoke any tool exposed by the session-linked MCP server.

Existing keys with the legacy Sessions permission retain the session execution and MCP access they had before the permission split. They do not gain session proxy execution.

## Legacy MCP routes require MCP (Legacy) access

Use MCP (Legacy) read or write access to view or manage MCP servers and instances. Connecting to an MCP transport requires MCP (Legacy) write access and grants every capability exposed by that server.
