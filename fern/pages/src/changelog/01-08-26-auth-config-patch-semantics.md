# True PATCH Semantics for Auth Config Updates

The `PATCH /api/v3/auth_configs/{id}` endpoint now implements proper partial update semantics. Previously, omitting fields would clear them (behaving like PUT). Now, omitted fields are preserved—only explicitly provided fields are modified.

<Warning>
**Breaking Change**: If you relied on omitting fields to clear them, you must now explicitly send `null` or `[]`. See [Migration Guide](#migration-guide) below.
</Warning>

## What Changed

| Field                         | Before (Buggy)           | After (Correct)                   |
| ----------------------------- | ------------------------ | --------------------------------- |
| `credentials`                 | Required on every update | Optional—merged with existing     |
| `proxy_config`                | Cleared if omitted       | Preserved if omitted              |
| `tool_access_config`          | Reset to `{}` if omitted | Preserved if omitted              |
| `scopes` (type: default)      | Cleared if omitted       | Preserved if omitted              |
| `restrict_to_following_tools` | Reset to `[]` if omitted | Preserved if omitted              |
| `shared_credentials`          | Replaced entirely        | Unchanged—still replaced entirely |

<Note>
**Merge vs Replace**: The `credentials` object is merged (send only fields you want to change). The `shared_credentials` object is replaced entirely (always send the complete dict).
</Note>

## New Capabilities

### Rotate a Single Credential Field

Update just `client_secret` without resending `client_id`, `scopes`, or other fields:

```typescript
// TypeScript
const response = await fetch(`https://backend.composio.dev/api/v3/auth_configs/${authConfigId}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.COMPOSIO_API_KEY,
  },
  body: JSON.stringify({
    type: 'custom',
    credentials: {
      client_secret: 'new_rotated_secret',
    },
  }),
});
```

```python
# Python
import requests

response = requests.patch(
    f"https://backend.composio.dev/api/v3/auth_configs/{auth_config_id}",
    headers={
        "Content-Type": "application/json",
        "x-api-key": os.environ["COMPOSIO_API_KEY"],
    },
    json={
        "type": "custom",
        "credentials": {
            "client_secret": "new_rotated_secret",
        },
    },
)
```

### Update Tool Restrictions Without Touching Credentials

Previously, this would fail because `credentials` was required. Now it works:

```typescript
// TypeScript
await fetch(`https://backend.composio.dev/api/v3/auth_configs/${authConfigId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
  body: JSON.stringify({
    type: 'custom',
    tool_access_config: {
      tools_available_for_execution: ['GMAIL_SEND_EMAIL', 'GMAIL_READ_EMAIL'],
    },
  }),
});
```

```python
# Python
requests.patch(
    f"https://backend.composio.dev/api/v3/auth_configs/{auth_config_id}",
    headers={"Content-Type": "application/json", "x-api-key": api_key},
    json={
        "type": "custom",
        "tool_access_config": {
            "tools_available_for_execution": ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
        },
    },
)
```

## Migration Guide

### Am I Affected?

**Yes**, if your code relied on this pattern to clear fields:

```python
# This NO LONGER clears proxy_config—it now preserves the existing value
requests.patch(url, json={"type": "custom", "credentials": {...}})
```

**No**, if you always send complete payloads or only use PATCH to update fields.

### How to Clear Fields Explicitly

| To Clear                | Send This Value                                               |
| ----------------------- | ------------------------------------------------------------- |
| `proxy_config`          | `"proxy_config": null`                                        |
| `tool_access_config`    | `"tool_access_config": {"tools_available_for_execution": []}` |
| `scopes` (type:default) | `"scopes": []`                                                |

**Example—Clear proxy config:**

```typescript
// TypeScript
await fetch(url, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
  body: JSON.stringify({
    type: 'custom',
    proxy_config: null, // Explicitly clears
  }),
});
```

```python
# Python
requests.patch(url, json={"type": "custom", "proxy_config": None})
```

