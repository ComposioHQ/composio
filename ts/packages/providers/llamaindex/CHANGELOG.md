# @composio/llamaindex

## 0.2.7-alpha.4

### Patch Changes

- Updated dependencies [07551cd]
  - @composio/core@0.2.7-alpha.4

## 0.2.7-alpha.3

### Patch Changes

- Updated dependencies [f0e67c4]
  - @composio/core@0.2.7-alpha.3

## 0.2.7-alpha.2

### Patch Changes

- Updated dependencies [31521bd]
  - @composio/core@0.2.7-alpha.2

## 0.2.7-alpha.1

### Patch Changes

- Updated dependencies
  - @composio/core@0.2.7-alpha.1

## 0.2.7-alpha.0

### Patch Changes

- Updated dependencies
  - @composio/core@0.2.7-alpha.0

## 0.2.6

### Patch Changes

- b5cc23f: Fix dangerously skip version check in non agentic providers, Throw error instead of process.exit when api key doesn't exist, bump zod-to-json-schema to 3.25.0, which supports "zod/3"
- Updated dependencies [b5cc23f]
  - @composio/core@0.2.6

## 0.2.5

### Patch Changes

- e2762f2: Fix non-agentic providers to work without specifying versions
- Updated dependencies [e2762f2]
  - @composio/core@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [97c4138]
  - @composio/core@0.2.4

## 0.2.3

### Patch Changes

- Updated dependencies [f88ab99]
  - @composio/core@0.2.3

## 0.2.2

### Patch Changes

- cfc2c50: Update zod version to 4
- Updated dependencies [cfc2c50]
  - @composio/core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [6135896]
  - @composio/core@0.2.1

## 0.2.0

### Minor Changes

- 157bf7b: ### Added

  - **Version validation for manual tool execution**: Tools now require explicit toolkit version specification when executing manually to prevent unexpected behavior from `latest` version changes
  - **New `dangerously_skip_version_check` parameter** (Python) / `dangerouslySkipVersionCheck` (TypeScript): Optional flag to bypass version validation (use with caution)
  - **`ToolVersionRequiredError` exception** (Python): Raised when attempting to execute tools with `latest` version without skip flag, includes helpful error messages with 4 possible fixes
  - **`ComposioToolVersionRequiredError` error** (TypeScript): Parallel implementation for TypeScript SDK with detailed error context and resolution suggestions
  - **Comprehensive test coverage**: Added 19 new test methods in Python covering all tool execution scenarios including version resolution, error handling, modifiers, and environment variables

  ### Changed

  - **Tool execution behavior**: Manual execution via `tools.execute()` now validates toolkit versions before API calls
  - **Agentic provider flows**: Automatically set `dangerously_skip_version_check=True` internally to maintain backward compatibility for framework integrations
  - **Instance-level version resolution**: Both `execute()` and `_execute_tool()` methods now consistently resolve versions from instance-level `toolkit_versions` configuration
  - **Modifier support**: Added `dangerously_skip_version_check` to modifier parameter types for complete flow coverage
  - **Test version format**: Updated all test files to use production date-based version format (`20251201_XX`) instead of semantic versioning

  ### Fixed

  - **Consistent version handling**: Removed `toolkit_versions` parameter from `_execute_tool()` in favor of instance-level configuration, ensuring consistent version resolution across the SDK
  - **Code formatting**: Applied ruff formatting to all modified Python files
  - **Array parsing to ZodSchema**: Fixes in json-schema-to-zod to parse array without properties and with properties

  ### Migration Guide

  When manually executing tools, you must now specify toolkit versions:

  **Option 1: Pass explicit version parameter**

  ```python
  tools.execute("GITHUB_CREATE_ISSUE",
      arguments={...},
      version="20251201_01"
  )
  ```

  **Option 2: Configure at SDK initialization**

  ```python
  tools = Tools(client, provider,
      toolkit_versions={"github": "20251201_01"}
  )
  ```

  **Option 3: Use environment variables**

  ```bash
  export COMPOSIO_TOOLKIT_VERSION_GITHUB=20251201_01
  ```

  **Option 4: Skip validation (not recommended)**

  ```python
  tools.execute("GITHUB_CREATE_ISSUE",
      arguments={...},
      dangerously_skip_version_check=True
  )
  ```

  ### Developer Notes

  - Agentic framework integrations (LangChain, CrewAI, etc.) are not affected as they automatically use the skip flag
  - The `latest` version can still be used with the skip flag, but specific versions are strongly recommended
  - Error messages include all available resolution options for better developer experience

### Patch Changes

- Updated dependencies [157bf7b]
  - @composio/core@0.2.0

## 0.1.55

### Patch Changes

- Updated dependencies [8741165]
  - @composio/core@0.1.55

## 0.1.54

### Patch Changes

- Updated dependencies [e5b9db3]
  - @composio/core@0.1.54

## 0.1.53

### Patch Changes

- ea84142: Add Llamaindex provider for TS
