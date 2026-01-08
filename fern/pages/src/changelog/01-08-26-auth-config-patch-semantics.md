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

<CodeBlocks>
```python title="Python SDK"
from composio import Composio

composio = Composio()

# Only send the field you want to update - other credentials are preserved

composio.auth_configs.update(
"ac_yourAuthConfigId",
options={
"type": "custom",
"credentials": {
"client_secret": "new_rotated_secret",
},
},
)

````

```typescript title="TypeScript SDK"
import { Composio } from "@composio/core";

const composio = new Composio();

// Only send the field you want to update - other credentials are preserved
await composio.authConfigs.update("ac_yourAuthConfigId", {
  type: "custom",
  credentials: {
    client_secret: "new_rotated_secret",
  },
});
````

</CodeBlocks>

### Update Tool Restrictions Without Touching Credentials

Previously, this would fail because `credentials` was required. Now it works:

<CodeBlocks>
```python title="Python SDK"
from composio import Composio

composio = Composio()

# Update tool restrictions - credentials are automatically preserved

composio.auth_configs.update(
"ac_yourAuthConfigId",
options={
"type": "custom",
"tool_access_config": {
"tools_available_for_execution": ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
},
},
)

````

```typescript title="TypeScript SDK"
import { Composio } from "@composio/core";

const composio = new Composio();

// Note: TypeScript SDK currently requires credentials for custom type updates
await composio.authConfigs.update("ac_yourAuthConfigId", {
  type: "custom",
  credentials: {
    // Include existing credentials when using TS SDK
  },
  toolAccessConfig: {
    toolsAvailableForExecution: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
  },
});
````

</CodeBlocks>

## Migration Guide

### Am I Affected?

**Yes**, if your code relied on omitting fields to clear them.

**No**, if you always send complete payloads or only use PATCH to update specific fields.

### How to Clear Fields Explicitly

| To Clear             | Python SDK                                                    | TypeScript SDK                                         |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| `proxy_config`       | `"proxy_config": None`                                        | `proxyConfig: null` (via HTTP API)                     |
| `tool_access_config` | `"tool_access_config": {"tools_available_for_execution": []}` | `toolAccessConfig: { toolsAvailableForExecution: [] }` |
| `scopes` (default)   | `"scopes": ""`                                                | `scopes: ""` (via HTTP API)                            |

<CodeBlocks>
```python title="Python SDK - Clear tool restrictions"
from composio import Composio

composio = Composio()

# Explicitly clear tool restrictions with empty array

composio.auth_configs.update(
"ac_yourAuthConfigId",
options={
"type": "custom",
"tool_access_config": {
"tools_available_for_execution": [],
},
},
)

````

```typescript title="TypeScript SDK - Clear tool restrictions"
import { Composio } from "@composio/core";

const composio = new Composio();

// Explicitly clear tool restrictions with empty array
await composio.authConfigs.update("ac_yourAuthConfigId", {
  type: "custom",
  credentials: {
    // Include existing credentials when using TS SDK
  },
  toolAccessConfig: {
    toolsAvailableForExecution: [],
  },
});
````

</CodeBlocks>

### Raw HTTP API

For users calling the API directly:

```bash
# Rotate single credential
curl -X PATCH "https://backend.composio.dev/api/v3/auth_configs/{id}" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "custom", "credentials": {"client_secret": "new_secret"}}'

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
