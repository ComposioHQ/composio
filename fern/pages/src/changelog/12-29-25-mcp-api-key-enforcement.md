# Optional API Key Enforcement for MCP Servers

We've introduced a new project-level security setting that allows you to require API key authentication for all MCP server requests. This opt-in feature gives you fine-grained control over who can access your MCP endpoints.

## What's New

A new **"Require API Key for MCP"** toggle is now available in your Project Settings. When enabled, all requests to your MCP servers must include a valid Composio API key in the request headers.

| Setting | Default | Impact |
|---------|---------|--------|
| `require_mcp_api_key` | `false` | Opt-in; no changes to existing behavior |

<Note>
This is an **opt-in security feature**. Your existing MCP integrations will continue to work without any changes unless you explicitly enable this setting.
</Note>

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
curl -X POST "https://mcp.composio.dev/{mcp_url}" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'

# Response: 401 Unauthorized
# {"error": "API key is required in headers for security reasons"}
```

**With API key:**
```bash
curl -X POST "https://mcp.composio.dev/{mcp_url}" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_your_api_key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'

# Response: 200 OK
```

## Enabling the Setting

### Via Dashboard

1. Navigate to [Project Settings](https://platform.composio.dev/settings)
2. Find the **"Require API Key for MCP"** toggle under Security settings
3. Enable the toggle
4. Save your changes

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

### Via SDK

<CodeGroup>
```python title="Python"
# Update project config to require MCP API key
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
// Update project config to require MCP API key
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

## Backward Compatibility

This is a **fully opt-in feature** with no impact on existing integrations:

- Default value is `false` — no changes to current behavior
- Existing MCP servers continue to work without modification
- You can enable/disable the setting at any time
- The setting applies project-wide to all MCP servers in that project

## API Reference

### Get Current Setting

```http
GET /api/v3/org/project/config
```

### Update Setting

```http
PATCH /api/v3/org/project/config

{
  "require_mcp_api_key": true | false
}
```

## Need Help?

If you have questions about implementing API key enforcement for your MCP servers:
- Join our [Discord community](https://discord.gg/composio)
- Check our [MCP documentation](/docs/mcp/quickstart)
- Contact support at support@composio.dev

