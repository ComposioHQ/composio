# Tool Router Improvements and New Features

## Version Information

### TypeScript/JavaScript
- Package: `@composio/core` and provider packages
- Version: `0.3.4` to `0.4.0`

### Python
- Package: `composio-core` and provider packages  
- Version: `0.10.4` to `0.10.5`

## New Features

### 1. Wait for Connections Property

Added `waitForConnections` (TypeScript) / `wait_for_connections` (Python) property to manage connections configuration. This allows tool router sessions to wait for users to complete authentication before proceeding to the next step.

**TypeScript:**
```typescript
const session = await composio.toolRouter.create(userId, {
  manageConnections: {
    enable: true,
    callbackUrl: 'https://example.com/callback',
    waitForConnections: true  // NEW
  }
});
```

**Python:**
```python
session = tool_router.create(
    user_id="user_123",
    manage_connections={
        "enable": True,
        "callback_url": "https://example.com/callback",
        "wait_for_connections": True  # NEW
    }
)
```

### 2. Session-Specific Modifier Types

Introduced new modifier types for better session-based tool execution: `SessionExecuteMetaModifiers` and `SessionMetaToolOptions`.

**TypeScript:**
```typescript
const tools = await session.tools({
  modifySchema: ({ toolSlug, toolkitSlug, schema }) => schema,
  beforeExecute: ({ toolSlug, toolkitSlug, sessionId, params }) => params,
  afterExecute: ({ toolSlug, toolkitSlug, sessionId, result }) => result
});
```

**Python:**
```python
from composio.core.models import before_execute_meta, after_execute_meta

@before_execute_meta
def before_modifier(tool, toolkit, session_id, params):
    return params

@after_execute_meta  
def after_modifier(tool, toolkit, session_id, response):
    return response

tools = session.tools(modifiers=[before_modifier, after_modifier])
```

### 3. Dedicated Method for Tool Router Meta Tools

Added `getRawToolRouterMetaTools` (TypeScript) / `get_raw_tool_router_meta_tools` (Python) method in the Tools class for fetching meta tools directly from a tool router session.

**TypeScript:**
```typescript
const metaTools = await composio.tools.getRawToolRouterMetaTools('session_123', {
  modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
    // Customize schema
    return schema;
  }
});
```

**Python:**
```python
meta_tools = tools_model.get_raw_tool_router_meta_tools(
    session_id="session_123",
    modifiers=[schema_modifier]
)
```

## Internal Improvements

### 1. Performance Optimization

Eliminated unnecessary tool fetching during tool router execution, resulting in faster tool execution with fewer API calls.

### 2. Improved Architecture

Tool router sessions now fetch tools directly from the session API endpoint instead of using tool slugs, providing better consistency and reliability.

### 3. Simplified Implementation

Removed redundant tool schema fetching in execution paths, using a hardcoded 'composio' toolkit slug for meta tools.

## Backward Compatibility

This release is fully backward compatible:

- All existing code continues to work without modifications
- New properties are optional with sensible defaults
- New modifier types can be adopted incrementally
- Internal changes have no impact on public APIs
- No migration required

## Impact Summary

| Change | Runtime Breaking | TypeScript Breaking | Migration Required |
|--------|------------------|---------------------|-------------------|
| `wait_for_connections` property | No | No | No |
| Session-specific modifiers | No | No | No |
| `getRawToolRouterMetaTools` method | No | No | No |
| Tool router uses session API | No | No | No |
| Optimized tool execution | No | No | No |

All changes follow semantic versioning principles and maintain full backward compatibility.

