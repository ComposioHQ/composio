# [Critical] File Upload/Download Fixes for `latest` tool with anyOf, oneOf, and allOf Schemas

## Version Information

### TypeScript/JavaScript
- Package: `@composio/core` and provider packages
- Version: `0.5.3`+

### Python
- Package: `composio` and provider packages
- Version: `0.10.8`+

---

The file handling modifiers now properly handle `file_uploadable` and `file_downloadable` properties nested within `anyOf`, `oneOf`, and `allOf` JSON Schema declarations. Previously, only direct child properties (and partial `allOf` support) were detected for file upload/download transformations.

<Note>
We recommend updating to version `0.5.3` (TypeScript) or `0.10.8` (Python) or later to ensure file uploads and downloads work correctly with tools that use union or intersection types in their schemas.
</Note>

## What Changed

### Before (Bug)

File properties inside `anyOf`, `oneOf`, or `allOf` were not detected:

```typescript
// This schema's file_uploadable was NOT being processed
inputParameters: {
  type: 'object',
  properties: {
    fileInput: {
      anyOf: [
        {
          type: 'string',
          file_uploadable: true  // ❌ Not detected
        },
        {
          type: 'null'
        }
      ]
    }
  }
}
```

### After (Fixed)

File properties are now correctly detected and processed at any nesting level:

```typescript
// Now properly detected and transformed
inputParameters: {
  type: 'object',
  properties: {
    fileInput: {
      anyOf: [
        {
          type: 'string',
          file_uploadable: true  // ✅ Detected and processed
        },
        {
          type: 'null'
        }
      ]
    }
  }
}
```

## Affected Scenarios

| Scenario | Before | After |
|----------|--------|-------|
| `file_uploadable` in `anyOf` | Not detected | ✅ Works |
| `file_uploadable` in `oneOf` | Not detected | ✅ Works |
| `file_uploadable` in `allOf` | Not detected | ✅ Works |
| `file_downloadable` in `anyOf` | Not detected | ✅ Works |
| `file_downloadable` in `oneOf` | Not detected | ✅ Works |
| `file_downloadable` in `allOf` | Not detected | ✅ Works |
| Nested objects inside union types | Not detected | ✅ Works |
| Array items with union types | Not detected | ✅ Works |

## How to Update

### TypeScript/JavaScript

<CodeBlocks>
```bash title="npm"
npm update @composio/core@latest
```

```bash title="pnpm"
pnpm update @composio/core@latest
```

```bash title="yarn"
yarn upgrade @composio/core@latest
```
</CodeBlocks>

### Python

<CodeBlocks>
```bash title="pip"
pip install --upgrade composio
```

```bash title="uv"
uv pip install --upgrade composio
```

```bash title="poetry"
poetry update composio
```
</CodeBlocks>

## Backward Compatibility

This release is fully backward compatible:

- All existing code continues to work without modifications
- No migration required
- File upload/download for direct properties continues to work as before
- The fix only adds support for previously unsupported schema patterns

## Impact Summary

| Change | Runtime Breaking | TypeScript Breaking | Migration Required |
|--------|------------------|---------------------|-------------------|
| `anyOf` support for file uploads | No | No | No |
| `oneOf` support for file uploads | No | No | No |
| `allOf` support for file uploads | No | No | No |
| `anyOf` support for file downloads | No | No | No |
| `oneOf` support for file downloads | No | No | No |
| `allOf` support for file downloads | No | No | No |
