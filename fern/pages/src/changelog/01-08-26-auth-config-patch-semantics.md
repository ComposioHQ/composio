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

<CodeBlocks>
```typescript title="TypeScript SDK"
import { Composio } from "composio-core";

const composio = new Composio();

// Update only the client_secret - other credentials are preserved
const updatedAuthConfig = await composio.authConfigs.update('ac_yourAuthConfigId', {
type: 'custom',
credentials: {
client_secret: 'new_rotated_secret',
},
});

````

```python title="Python SDK"
from composio import Composio

composio = Composio()

# Update only the client_secret - other credentials are preserved
updated_auth_config = composio.auth_configs.update(
    "ac_yourAuthConfigId",
    options={
        "type": "custom",
        "credentials": {
            "client_secret": "new_rotated_secret",
        },
    },
)
````

</CodeBlocks>

### Update Tool Restrictions Without Touching Credentials

Previously, this would fail because `credentials` was required. Now it works:

<CodeBlocks>
```typescript title="TypeScript SDK"
import { Composio } from "composio-core";

const composio = new Composio();

// Update tool restrictions - credentials are automatically preserved
const updatedAuthConfig = await composio.authConfigs.update('ac_yourAuthConfigId', {
type: 'custom',
toolAccessConfig: {
toolsAvailableForExecution: ['GMAIL_SEND_EMAIL', 'GMAIL_READ_EMAIL'],
},
});

````

```python title="Python SDK"
from composio import Composio

composio = Composio()

# Update tool restrictions - credentials are automatically preserved
updated_auth_config = composio.auth_configs.update(
    "ac_yourAuthConfigId",
    options={
        "type": "custom",
        "tool_access_config": {
            "tools_available_for_execution": ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
        },
    },
)
````

</CodeBlocks>

### Update Scopes for Default Auth Configs

<CodeBlocks>
```typescript title="TypeScript SDK"
import { Composio } from "composio-core";

const composio = new Composio();

// Update scopes without affecting tool restrictions
const updatedAuthConfig = await composio.authConfigs.update('ac_yourAuthConfigId', {
type: 'default',
scopes: 'read:user,repo,write:org',
});

````

```python title="Python SDK"
from composio import Composio

composio = Composio()

# Update scopes without affecting tool restrictions
updated_auth_config = composio.auth_configs.update(
    "ac_yourAuthConfigId",
    options={
        "type": "default",
        "scopes": "read:user,repo,write:org",
    },
)
````

</CodeBlocks>

## Migration Guide

### Am I Affected?

**Yes**, if your code relied on omitting fields to clear them. This pattern no longer works:

<CodeBlocks>
```typescript title="TypeScript SDK - Old Behavior"
// Before: omitting toolAccessConfig would reset it to {}
// After: omitting toolAccessConfig preserves the existing value
await composio.authConfigs.update('ac_id', {
  type: 'custom',
  credentials: { client_secret: 'new_secret' },
  // toolAccessConfig not provided - NOW PRESERVED instead of cleared
});
```

```python title="Python SDK - Old Behavior"
# Before: omitting tool_access_config would reset it to {}
# After: omitting tool_access_config preserves the existing value
composio.auth_configs.update(
    "ac_id",
    options={
        "type": "custom",
        "credentials": {"client_secret": "new_secret"},
        # tool_access_config not provided - NOW PRESERVED instead of cleared
    },
)
```

</CodeBlocks>

**No**, if you always send complete payloads or only use PATCH to update specific fields.

### How to Clear Fields Explicitly

| To Clear                | Send This Value                                                                 |
| ----------------------- | ------------------------------------------------------------------------------- |
| `proxy_config`          | `null` (Python: `None`)                                                         |
| `tool_access_config`    | `{ tools_available_for_execution: [] }` or `{ toolsAvailableForExecution: [] }` |
| `scopes` (type:default) | `""` (empty string) or `[]`                                                     |

**Example—Clear tool access config:**

<CodeBlocks>
```typescript title="TypeScript SDK"
import { Composio } from "composio-core";

const composio = new Composio();

// Explicitly clear tool restrictions
await composio.authConfigs.update('ac_yourAuthConfigId', {
type: 'custom',
toolAccessConfig: {
toolsAvailableForExecution: [], // Explicitly clears
},
});

````

```python title="Python SDK"
from composio import Composio

composio = Composio()

# Explicitly clear tool restrictions
composio.auth_configs.update(
    "ac_yourAuthConfigId",
    options={
        "type": "custom",
        "tool_access_config": {
            "tools_available_for_execution": [],  # Explicitly clears
        },
    },
)
````

</CodeBlocks>

### Raw HTTP API

For users calling the API directly without SDKs:

```bash
# Clear proxy_config
curl -X PATCH "https://backend.composio.dev/api/v3/auth_configs/{id}" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "custom", "proxy_config": null}'
```
