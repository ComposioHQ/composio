# True PATCH Semantics for Auth Config Updates

The `PATCH /api/v3/auth_configs/{id}` endpoint now supports true partial updates. Previously, omitting optional fields would reset them to defaults. Now, only explicitly provided fields are modified—unprovided fields retain their existing values.

<Warning>
**Breaking Change for edge cases**: If your integration relied on the previous behavior where omitting fields (like `proxy_config` or `tool_access_config`) would clear them, you'll need to explicitly pass `null` or empty values to achieve the same effect.
</Warning>

## What Changed

| Field | Previous Behavior | New Behavior |
|-------|------------------|--------------|
| `credentials` | Required on every update | Optional—existing credentials preserved if not sent |
| `proxy_config` | Reset to `null` if omitted | Preserved if not sent |
| `tool_access_config` | Reset to empty if omitted | Preserved if not sent |

## Examples

### Update Only `tool_access_config` (Preserve Credentials)

**Before**: This would fail because `credentials` was required.

**Now**: Works correctly—credentials are preserved.

<CodeGroup>
```bash title="cURL"
curl -X PATCH "https://backend.composio.dev/api/v3/auth_configs/ac_yourAuthConfigId" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_your_api_key" \
  -d '{
    "type": "custom",
    "tool_access_config": {
      "tools_available_for_execution": ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"]
    }
  }'
```
```python title="Python"
import requests

response = requests.patch(
    "https://backend.composio.dev/api/v3/auth_configs/ac_yourAuthConfigId",
    headers={
        "Content-Type": "application/json",
        "x-api-key": "ak_your_api_key"
    },
    json={
        "type": "custom",
        "tool_access_config": {
            "tools_available_for_execution": ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"]
        }
    }
)
```
```typescript title="TypeScript"
const response = await fetch(
  "https://backend.composio.dev/api/v3/auth_configs/ac_yourAuthConfigId",
  {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "ak_your_api_key"
    },
    body: JSON.stringify({
      type: "custom",
      tool_access_config: {
        tools_available_for_execution: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"]
      }
    })
  }
);
```
</CodeGroup>

### Update Credentials Only (Preserve Everything Else)

<CodeGroup>
```bash title="cURL"
curl -X PATCH "https://backend.composio.dev/api/v3/auth_configs/ac_yourAuthConfigId" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_your_api_key" \
  -d '{
    "type": "custom",
    "credentials": {
      "client_secret": "new_rotated_secret"
    }
  }'
```
```python title="Python"
response = requests.patch(
    "https://backend.composio.dev/api/v3/auth_configs/ac_yourAuthConfigId",
    headers={
        "Content-Type": "application/json",
        "x-api-key": "ak_your_api_key"
    },
    json={
        "type": "custom",
        "credentials": {
            "client_secret": "new_rotated_secret"
        }
    }
)
```
</CodeGroup>

### Explicitly Clear a Field

To explicitly remove a configuration, send `null`:

```bash
curl -X PATCH "https://backend.composio.dev/api/v3/auth_configs/ac_yourAuthConfigId" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_your_api_key" \
  -d '{
    "type": "custom",
    "proxy_config": null
  }'
```

## Migration Notes

### If You Were Doing Full Replacements

No changes needed—continue sending all fields as before.

### If You Were Relying on "Reset by Omission"

Update your code to explicitly send `null` or empty arrays:

```python
# Before: Omitting proxy_config would clear it
requests.patch(url, json={"type": "custom", "credentials": {...}})

# After: Explicitly clear proxy_config
requests.patch(url, json={"type": "custom", "credentials": {...}, "proxy_config": None})
```

## API Reference

| Method | Endpoint |
|--------|----------|
| `PATCH` | `/api/v3/auth_configs/{id}` |

### Request Body

All fields except `type` are now optional:

```json
{
  "type": "custom",
  "credentials": { ... },
  "proxy_config": { ... },
  "tool_access_config": { ... },
  "shared_credentials": { ... }
}
```

For `type: "default"` auth configs:

```json
{
  "type": "default",
  "scopes": ["scope1", "scope2"],
  "tool_access_config": { ... },
  "shared_credentials": { ... }
}
```

