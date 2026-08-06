# Composio For You

Use this path when someone wants their own coding agent or AI client to use their own connected apps. This is an MCP setup, not an SDK integration.

## MCP endpoint

```text
https://connect.composio.dev/mcp
```

Do not use the removed `mcp.composio.dev` endpoint or a Platform MCP URL.

## Authentication

Claude Desktop and ChatGPT use browser OAuth. Header-based clients use the consumer key from Dashboard → For You → Settings → Sessions & API Key:

```text
x-consumer-api-key: ck_...
```

The `ck_...` consumer key and Platform's `COMPOSIO_API_KEY` are not interchangeable.

## Terminal coding agents

Terminal agents can use the Composio CLI directly:

```bash
curl -fsSL https://composio.dev/install | bash
composio login
composio search "<what the user wants>"
composio link <toolkit>
composio execute <TOOL_SLUG> -d '{...}'
```

Use `composio login --no-wait | jq` when the agent cannot open a browser. Share the returned login URL, then complete login with the returned key.

## Client configuration

For any MCP-capable client, configure HTTP transport with the endpoint above and, when required, the `x-consumer-api-key` header. Fetch `https://docs.composio.dev/docs/composio-connect.md` for current client-specific steps.

## Connect apps naturally

Do not pre-connect every app. Start the real task. When an app is required, Composio returns an authorization link and the connection persists for future runs.

Setup is complete only after one real tool call succeeds.
