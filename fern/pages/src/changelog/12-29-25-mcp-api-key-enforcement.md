# Optional API Key Enforcement for MCP Servers

We've introduced a new project-level security setting that allows you to require API key authentication for all MCP server requests. This opt-in feature gives you fine-grained control over who can access your MCP endpoints.

<Note>
**Opt-in today, default soon**: This feature is currently opt-in. Starting **March 1, 2026**, it will be enabled by default for new organizations. We recommend enabling it now to prepare your integrations.
</Note>

## What's New

A new **"Require API Key for MCP"** toggle is now available in your Project Settings. When enabled, all requests to your MCP servers must include a valid Composio API key in the request headers.

| Setting | Default | Impact |
|---------|---------|--------|
| `require_mcp_api_key` | `false` | Opt-in; no changes to existing behavior |

## How It Works

When the setting is **disabled** (default):
- MCP servers work without API key authentication
- Existing integrations continue to function unchanged

When the setting is **enabled**:
- All MCP requests must include the `x-api-key` header with a valid Composio API key
- Requests without a valid API key receive `401 Unauthorized`
- Only API keys belonging to the same project are accepted

### Request Examples

**Without API key (when enforcement is enabled):**
```bash
curl -X POST "https://mcp.composio.dev/{your_mcp_server_url}" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

# Response: 401 Unauthorized
```

**With API key:**
```bash
curl -X POST "https://mcp.composio.dev/{your_mcp_server_url}" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_your_api_key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

# Response: 200 OK
```

## Enabling the Setting

### Via Dashboard

1. Navigate to [Project Settings](https://platform.composio.dev/{workspace}/{project}/settings)
2. Go to the **Project Configuration** tab
3. Find the **"Require API Key for MCP"** toggle
4. Enable the toggle

<Frame>
  <img src="/assets/images/mcp-api-key-toggle.png" alt="MCP API Key Toggle in Project Settings" />
</Frame>

### Via API

Update your project configuration using the API:

```bash
curl -X PATCH "https://backend.composio.dev/api/v3/org/project/config" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_your_api_key" \
  -d '{"require_mcp_api_key": true}'
```

**Response:**
```json
{
  "require_mcp_api_key": true,
  "is_2FA_enabled": true,
  "mask_secret_keys_in_connected_account": true,
  "log_visibility_setting": "show_all"
}
```

### Via Code

<CodeGroup>
```python title="Python"
import requests

response = requests.patch(
    "https://backend.composio.dev/api/v3/org/project/config",
    headers={
        "Content-Type": "application/json",
        "x-api-key": "ak_your_api_key"
    },
    json={"require_mcp_api_key": True}
)

print(response.json())
```
```typescript title="TypeScript"
const response = await fetch(
  "https://backend.composio.dev/api/v3/org/project/config",
  {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "ak_your_api_key"
    },
    body: JSON.stringify({ require_mcp_api_key: true })
  }
);

console.log(await response.json());
```
</CodeGroup>

## When to Use This

Enable API key enforcement when you need to:

- **Prevent unauthorized access** to your MCP servers
- **Control which applications** can interact with your MCP endpoints
- **Add an extra security layer** for production deployments
- **Audit and track** MCP server usage through API key attribution

## API Reference

### Get Current Setting

```http
GET /api/v3/org/project/config
```

### Update Setting

```http
PATCH /api/v3/org/project/config
```

```json
{
  "require_mcp_api_key": true
}
```
