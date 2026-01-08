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
import { Composio } from "@composio/core";

const composio = new Composio();

const updated = await composio.authConfigs.update("ac_yourAuthConfigId", {
type: "custom",
credentials: {
client_secret: "new_rotated_secret",
},
});

````

```python title="Python SDK"
from composio import Composio

composio = Composio()

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

</CodeBlocks>

### Update Tool Restrictions Without Touching Credentials

<CodeBlocks>
```typescript title="TypeScript SDK"
await composio.authConfigs.update("ac_yourAuthConfigId", {
  type: "custom",
  toolAccessConfig: {
    toolsAvailableForExecution: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
  },
});
```

```python title="Python SDK"
composio.auth_configs.update(
    "ac_yourAuthConfigId",
    options={
        "type": "custom",
        "tool_access_config": {
            "tools_available_for_execution": ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL"],
        },
    },
)
```

</CodeBlocks>

## Migration Guide

### Am I Affected?

**Yes**, if your code relied on omitting fields to clear them.

**No**, if you always send complete payloads or only use PATCH to update specific fields.

### How to Clear Fields Explicitly

| To Clear                | Send This Value                      |
| ----------------------- | ------------------------------------ |
| `proxy_config`          | `null` (Python: `None`)              |
| `tool_access_config`    | `{ toolsAvailableForExecution: [] }` |
| `scopes` (type:default) | `""` (empty string)                  |

<CodeBlocks>
```typescript title="TypeScript SDK - Clear proxy_config"
await composio.authConfigs.update("ac_yourAuthConfigId", {
  type: "custom",
  proxyConfig: null,
});
```

```python title="Python SDK - Clear proxy_config"
composio.auth_configs.update(
    "ac_yourAuthConfigId",
    options={
        "type": "custom",
        "proxy_config": None,
    },
)
```

</CodeBlocks>
