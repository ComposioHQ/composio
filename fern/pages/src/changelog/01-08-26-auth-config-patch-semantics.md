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

Update just `client_secret` without resending `client_id` or other fields:

```bash
curl -X PATCH "https://backend.composio.dev/api/v3/auth_configs/{id}" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "custom",
    "credentials": {
      "client_secret": "new_rotated_secret"
    }
  }'
```

### Update Tool Restrictions Without Touching Credentials

Previously, this would fail because `credentials` was required. Now it works:

```bash
curl -X PATCH "https://backend.composio.dev/api/v3/auth_configs/{id}" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "custom",
    "tool_access_config": {
      "tools_available_for_execution": ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"]
    }
  }'
```

### Update Scopes for Default Auth Configs

```bash
curl -X PATCH "https://backend.composio.dev/api/v3/auth_configs/{id}" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "default",
    "scopes": "read:user,repo,write:org"
  }'
```

## Migration Guide

### Am I Affected?

**Yes**, if your code relied on omitting fields to clear them.

**No**, if you always send complete payloads or only use PATCH to update specific fields.

### How to Clear Fields Explicitly

| To Clear             | Send This Value                                 |
| -------------------- | ----------------------------------------------- |
| `proxy_config`       | `null`                                          |
| `tool_access_config` | `{ "tools_available_for_execution": [] }`       |
| `scopes`             | `""` (empty string)                             |

```bash
# Clear proxy_config
curl -X PATCH "https://backend.composio.dev/api/v3/auth_configs/{id}" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "custom", "proxy_config": null}'

# Clear tool restrictions
curl -X PATCH "https://backend.composio.dev/api/v3/auth_configs/{id}" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "custom", "tool_access_config": {"tools_available_for_execution": []}}'
```

<Note>
**SDK Support**: The Python and TypeScript SDKs will be updated in a future release to fully support all PATCH capabilities. Until then, use the raw HTTP API for features like updating `proxy_config` or `shared_credentials`.
</Note>
