# @composio/json-schema-to-zod

## 0.1.17

### Patch Changes

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

## 0.1.16

### Patch Changes

- 8741165: Add zod 4 support via zod/v3 and fix zod schema parsing

## 0.1.15

### Patch Changes

- 51033d8: Fix additional properties in nested structures

## 0.1.14

### Patch Changes

- 5027e18: Fix openai responses schema parsing

## 0.1.13

### Patch Changes

- Fix parsing of additional properties

## 0.1.12

### Patch Changes

- Fix additionalProperties to be always present

## 0.1.11

### Patch Changes

- Fix jsonSchema to zod parsing which used to eliminate min/max and examples proeperties

## 0.1.10

### Patch Changes

- 7276d1e: Fix issues with json schema to zod parsing causing nested objects to be marked as required
- 7276d1e: Fix issues with objects with default values being marked as required
- 06612f5: Downgrade chalk to v4 to allow CJS as well
- 77e96e4: Fix JSON Schema to Zod Parsing
- cb1b401: Bump packages for authconfig fixes
- Create stable release

## 0.1.10-next.5

### Patch Changes

- 77e96e4: Fix JSON Schema to Zod Parsing

## 0.1.10-next.4

### Patch Changes

- Bump packages for authconfig fixes

## 0.1.10-next.3

### Patch Changes

- 06612f5: Downgrade chalk to v4 to allow CJS as well

## 0.1.10-next.2

### Patch Changes

- Downgrade chalk to v4 to allow CJS as well

## 0.1.10-next.1

### Patch Changes

- Fix issues with objects with default values being marked as required

## 0.1.10-next.0

### Patch Changes

- Fix issues with json schema to zod parsing causing nested objects to be marked as required

## 0.1.9

### Patch Changes

- Add host name support in SDK

## 0.1.8

### Patch Changes

- 1ab34ef: Fix json schema support in tools

## 0.1.7

### Patch Changes

- c8e89d5: Fix telemetry transport

## 0.1.6

### Patch Changes

- 37a1f01: Feat better connected account creation flow

## 0.1.5

### Patch Changes

- df31cc2: Fix json schema parsing

## 0.1.2

### Patch Changes

- f943ba4: Export all the types from the core SDK

## 0.1.2

### Patch Changes

- 208e320: Update json schema transformations issues related to strict mode

## 0.1.1

### Patch Changes

- 4ddfafc: Add json schema to zod schema
