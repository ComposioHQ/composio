---
'@composio/core': patch
---


Add toolkit versions support and deprecation flags to TypeScript SDK

This PR adds support for toolkit versions in the TypeScript SDK and introduces new fields for tracking tool deprecation status and no-auth capabilities.

### Core Features
- **Toolkit Versions Support**: 
  - Added `toolkit_versions` parameter to the `Triggers` class, defaulting to `"latest"`
  - Made `Triggers` class generic to accept provider configuration
  - Pass `toolkit_versions` when listing trigger types

### New Fields
- **Tool Types**:
  - Added `isDeprecated` field to track deprecated tools
  - Added `isNoAuth` field to identify tools that support no-auth mode
  
- **Trigger Types**:
  - Added `version` field to track trigger versions
  
- **Toolkit Metadata**:
  - Added `availableVersions` array to track all available versions

### Code Changes
- Updated `Composio` class to pass config to `Triggers` constructor
- Updated `Tools.get()` to include new `isDeprecated` and `isNoAuth` fields
- Updated transformers for toolkits and triggers to handle new fields
- Added TypeScript types for all new fields

### Tests
- Updated trigger tests to account for `toolkit_versions` and `cursor` parameters
- Fixed generic type usage in `Triggers` test declarations
- All 376 tests passing ✅

### Dependencies
- Updated `@composio/client` to version `0.1.0-alpha.38`
- Updated `pnpm-lock.yaml` with dependency resolution changes

## Testing
```bash
pnpm --filter @composio/core test
```
All tests passing (376/376) ✅

## Breaking Changes
None - All changes are backwards compatible with default values

## Related Issues
Fixes toolkit version handling and deprecation flag tracking in TypeScript SDK
