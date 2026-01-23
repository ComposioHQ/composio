# Experimental Assistive Prompts and API Updates

## Version Information

### TypeScript/JavaScript
- Package: `@composio/core`
- Version: `0.5.5`+

### Python
- Package: `composio`
- Version: `0.10.10`+

## New Features

### Experimental Assistive Prompt Configuration

Tool Router sessions now support experimental configuration for timezone-aware assistive prompts. When you provide a user's timezone, the session returns a contextual assistive prompt that includes timezone-specific guidance.

<Warning>
This is an experimental feature. The API may change or be removed in future versions.
</Warning>

<CodeBlocks>
```python title="Python SDK"
from composio import Composio

composio = Composio()

session = composio.tool_router.create(
    user_id="user_123",
    toolkits=["github"],
    experimental={
        "assistive_prompt": {
            "user_timezone": "America/New_York",
        }
    },
)

# Access the generated assistive prompt
if session.experimental:
    print(session.experimental.assistive_prompt)
```

```typescript title="TypeScript SDK"
import { Composio } from "@composio/core";

const composio = new Composio();

const session = await composio.toolRouter.create("user_123", {
  toolkits: ["github"],
  experimental: {
    assistivePrompt: {
      userTimezone: "America/New_York",
    },
  },
});

// Access the generated assistive prompt
if (session.experimental) {
  console.log(session.experimental.assistivePrompt);
}
```
</CodeBlocks>

<Note>
The `experimental` field is only available on sessions created with `create()`. Sessions retrieved with `use()` do not include the experimental data.
</Note>

### Toolkit Endpoint Method

The toolkit retrieve response now includes `getCurrentUserEndpointMethod` (TypeScript) / `get_current_user_endpoint_method` (Python) to indicate the HTTP method for the current user endpoint.

## Breaking Changes

### Trigger Pagination: `page` Replaced with `cursor`

The `page` parameter in `listActive` / `list_active` for trigger instances has been replaced with `cursor` for cursor-based pagination. There was a bug in earlier APIs which caused `page` param to be ignored, going ahead for pagination please use `cursor` instead. 

<CodeBlocks>
```python title="Python SDK"
# Before (deprecated)
triggers = composio.triggers.list_active(page=1, limit=10)

# After
triggers = composio.triggers.list_active(cursor="cursor_string", limit=10)
# Use response.next_cursor for the next page
```

```typescript title="TypeScript SDK"
// Before (deprecated)
const triggers = await composio.triggers.listActive({ page: 1, limit: 10 });

// After
const triggers = await composio.triggers.listActive({ cursor: "cursor_string", limit: 10 });
// Use response.nextCursor for the next page
```
</CodeBlocks>

## Impact Summary

| Change | Runtime Breaking | TypeScript Breaking | Migration Required |
|--------|------------------|---------------------|-------------------|
| Experimental assistive prompts | No | No | No |
| `getCurrentUserEndpointMethod` field | No | No | No |
| `page` → `cursor` in triggers | Yes | Yes | Yes (if using `page`) |

## Migration Guide

If you are using the `page` parameter in `listActive` / `list_active`:

1. Replace `page` with `cursor`
2. For the first request, omit the `cursor` parameter or pass `undefined`/`None`
3. Use the `nextCursor` / `next_cursor` from the response for subsequent requests
