# @composio/openai

## 0.5.1

### Patch Changes

- Updated dependencies [3055048]
  - @composio/core@0.5.1

## 0.5.0

### Minor Changes

- d80f3e2: Bump core dependency to 0.5.0

## 0.4.0

### Minor Changes

- c7e1217: Add support for dedicated tools for tool router

### Patch Changes

- Updated dependencies [c7e1217]
  - @composio/core@0.4.0

## 0.3.4

### Patch Changes

- Updated dependencies [019f54f]
  - @composio/core@0.3.4

## 0.3.3

### Patch Changes

- Updated dependencies [a76b002]
  - @composio/core@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies [69cfede]
  - @composio/core@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [73db5f5]
  - @composio/core@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies
  - @composio/core@0.3.0

## 0.2.7

### Patch Changes

- Updated dependencies [07551cd]
- Updated dependencies [9e002c5]
- Updated dependencies [f0e67c4]
- Updated dependencies [31521bd]
- Updated dependencies [9e002c5]
  - @composio/core@0.2.7

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

- 9a1b0e9: - Adds the new experiemntal ToolRouter, Deprecates the existing MCP experience and adds the new MCP components.
  - The old MCP components can be accessed via `deprecated.mcp` until the next release, where it will get removed.
  - Fixes `toolkits.list` and `toolkits.get` methods to add `description` to connection fields
- Updated dependencies [9a1b0e9]
  - @composio/core@0.1.53

## 0.1.52

### Patch Changes

- 7077cee: Add tool versioning support
- Updated dependencies [7077cee]
  - @composio/core@0.1.52

## 0.1.51

### Patch Changes

- Updated dependencies [b9b005a]
  - @composio/core@0.1.51

## 0.1.50

### Patch Changes

- @composio/core@0.1.50

## 0.1.49

### Patch Changes

- Updated dependencies [5027e18]
  - @composio/core@0.1.49

## 0.1.48

### Patch Changes

- bb32cc2: Bump openai responses and deprecate openai assistant
- Updated dependencies [bb32cc2]
  - @composio/core@0.1.48

## 0.1.47

### Patch Changes

- Updated dependencies [05ce9c6]
  - @composio/core@0.1.47

## 0.1.46

### Patch Changes

- Updated dependencies [ee12d25]
- Updated dependencies [9458513]
  - @composio/core@0.1.46

## 0.1.45

### Patch Changes

- @composio/core@0.1.45

## 0.1.44

### Patch Changes

- b4b8b94: Fix telemetry flags and disable when passed
- Updated dependencies [b4b8b94]
  - @composio/core@0.1.44

## 0.1.43

### Patch Changes

- eb7691e: Add strict mode to vercel provider
- Updated dependencies [eb7691e]
  - @composio/core@0.1.43

## 0.1.42

### Patch Changes

- @composio/core@0.1.42

## 0.1.41

### Patch Changes

- 025600f: Bump composio client version to 0.1.0-alpha.31
- Updated dependencies [025600f]
  - @composio/core@0.1.41

## 0.1.40

### Patch Changes

- 1664c34: Fix auth config creation/updation methods to accept tool access configs
- Updated dependencies [1664c34]
  - @composio/core@0.1.40

## 0.1.39

### Patch Changes

- Fix jsonSchema to zod parsing which used to eliminate min/max and examples proeperties
- Updated dependencies
  - @composio/core@0.1.39

## 0.1.38

### Patch Changes

- 6c980ad: Add generics for CLI trigger type generation
- Updated dependencies [6c980ad]
  - @composio/core@0.1.38

## 0.1.37

### Patch Changes

- 09c4a26: Fix issues with tools.execute requiring userId for no auth apps
- Updated dependencies [09c4a26]
  - @composio/core@0.1.37

## 0.1.36

### Patch Changes

- 7276d1e: Fix issues with json schema to zod parsing causing nested objects to be marked as required
- c223e54: Fix file upload handlers
- 7276d1e: Fix issues with objects with default values being marked as required
- 9a10986: Fix: Relax strict type/schema validations on API responses
- 06612f5: Downgrade chalk to v4 to allow CJS as well
- cb1b401: Update composio api client to latest version
- da57771: dont't validate if authConfigIds is provided
- 91c3647: Update deps
- b001330: Fix package bumps
- 77e96e4: Fix JSON Schema to Zod Parsing
- ea79c18: Bump packages
- cb1b401: Bump packages for authconfig fixes
- ea79c18: Update packages
- a79dfac: Relax connected account schema parsing
- Create stable release
- ea79c18: Fix: Gracefully handle connected account responses for missing fields
- 91c3647: Fix proxy execute params and bump langchain packages
- ea79c18: Bump packages
- Updated dependencies [7276d1e]
- Updated dependencies [c223e54]
- Updated dependencies [7276d1e]
- Updated dependencies [9a10986]
- Updated dependencies [06612f5]
- Updated dependencies [cb1b401]
- Updated dependencies [da57771]
- Updated dependencies [91c3647]
- Updated dependencies [b001330]
- Updated dependencies [77e96e4]
- Updated dependencies [ea79c18]
- Updated dependencies [cb1b401]
- Updated dependencies [ea79c18]
- Updated dependencies [a79dfac]
- Updated dependencies
- Updated dependencies [ea79c18]
- Updated dependencies [91c3647]
- Updated dependencies [ea79c18]
  - @composio/core@0.1.36

## 0.1.36-next.13

### Patch Changes

- 77e96e4: Fix JSON Schema to Zod Parsing
- Updated dependencies [77e96e4]
  - @composio/core@0.1.36-next.13

## 0.1.36-next.12

### Patch Changes

- Update deps
- Updated dependencies
  - @composio/core@0.1.36-next.12

## 0.1.36-next.11

### Patch Changes

- Fix proxy execute params and bump langchain packages
- Updated dependencies
  - @composio/core@0.1.36-next.11

## 0.1.36-next.10

### Patch Changes

- Fix: Relax strict type/schema validations on API responses
- Updated dependencies
  - @composio/core@0.1.36-next.10

## 0.1.36-next.9

### Patch Changes

- 9fa49ec: Update composio api client to latest version
- Bump packages for authconfig fixes
- Updated dependencies [9fa49ec]
- Updated dependencies
  - @composio/core@0.1.36-next.9

## 0.1.36-next.8

### Patch Changes

- Fix package bumps
- Updated dependencies
  - @composio/core@0.1.36-next.8

## 0.1.36-next.7

### Patch Changes

- da57771: dont't validate if authConfigIds is provided
- Updated dependencies [da57771]
  - @composio/core@0.1.36-next.7

## 0.1.36-next.6

### Patch Changes

- 06612f5: Downgrade chalk to v4 to allow CJS as well
- Relax connected account schema parsing
- Updated dependencies [06612f5]
- Updated dependencies
  - @composio/core@0.1.36-next.6

## 0.1.36-next.5

### Patch Changes

- dd630fe: Bump packages
- Bump packages
- Updated dependencies [dd630fe]
- Updated dependencies
  - @composio/core@0.1.36-next.5

## 0.1.36-next.4

### Patch Changes

- Update packages
- Updated dependencies
  - @composio/core@0.1.36-next.4

## 0.1.36-next.3

### Patch Changes

- Fix: Gracefully handle connected account responses for missing fields
- Updated dependencies
  - @composio/core@0.1.36-next.3

## 0.1.36-next.2

### Patch Changes

- Fix issues with objects with default values being marked as required
- Updated dependencies
  - @composio/core@0.1.36-next.2

## 0.1.36-next.1

### Patch Changes

- Fix issues with json schema to zod parsing causing nested objects to be marked as required
- Updated dependencies
  - @composio/core@0.1.36-next.1

## 0.1.36-next.0

### Patch Changes

- Fix file upload handlers
- Updated dependencies
  - @composio/core@0.1.36-next.0

## 0.1.35

### Patch Changes

- git status
- Updated dependencies
  - @composio/core@0.1.35

## 0.1.34

### Patch Changes

- Add exports for connection request
- Updated dependencies
  - @composio/core@0.1.34

## 0.1.33

### Patch Changes

- Fix types and exports
- Updated dependencies
  - @composio/core@0.1.33

## 0.1.32

### Patch Changes

- Add support for File type in uploading files
- Updated dependencies
  - @composio/core@0.1.32

## 0.1.31

### Patch Changes

- e660385: Fix file upload / download
- Updated dependencies [e660385]
  - @composio/core@0.1.31

## 0.1.30

### Patch Changes

- Improved support for file handling
- Updated dependencies
  - @composio/core@0.1.30

## 0.1.29

### Patch Changes

- Add file upload / download modifiers
- Updated dependencies
  - @composio/core@0.1.29

## 0.1.28

### Patch Changes

- Add MCP support for providers
- Updated dependencies
  - @composio/core@0.1.28

## 0.1.27

### Patch Changes

- Remove cusrsor and important flags from tools.get
- Updated dependencies
  - @composio/core@0.1.27

## 0.1.26

### Patch Changes

- Fix function signatures for toolkits auth fields
- Updated dependencies
  - @composio/core@0.1.26

## 0.1.25

### Patch Changes

- Add MCP server to composio SDk
- Updated dependencies
  - @composio/core@0.1.25

## 0.1.24

### Patch Changes

- Fix auth schemes for creating connected accounts
- Updated dependencies
  - @composio/core@0.1.24

## 0.1.23

### Patch Changes

- Improvements in DX in triggers and bug fixes in tools
- Updated dependencies
  - @composio/core@0.1.23

## 0.1.22

### Patch Changes

- Adds support for connected accounts allowMultiple flag, and other improvements
- Updated dependencies
  - @composio/core@0.1.22

## 0.1.21

### Patch Changes

- Add host name support in SDK
- Updated dependencies
  - @composio/core@0.1.21

## 0.1.20

### Patch Changes

- 1ab34ef: Fix json schema support in tools
- Updated dependencies [1ab34ef]
  - @composio/core@0.1.20

## 0.1.19

### Patch Changes

- c8e89d5: Fix telemetry transport
- Updated dependencies [c8e89d5]
  - @composio/core@0.1.19

## 0.1.18

### Patch Changes

- 37a1f01: Feat better connected account creation flow
- Updated dependencies [37a1f01]
  - @composio/core@0.1.18

## 0.1.17

### Patch Changes

- df31cc2: Fix json schema parsing
- Updated dependencies [df31cc2]
  - @composio/core@0.1.17

## 0.1.16

### Patch Changes

- f943ba4: Export all the types from the core SDK
- Updated dependencies [f943ba4]
  - @composio/core@0.1.16

## 0.1.15

### Patch Changes

- 208e320: Update json schema transformations issues related to strict mode
- Updated dependencies [208e320]
  - @composio/core@0.1.15

## 0.1.14

### Patch Changes

- 4ddfafc: Add json schema to zod schema
- Updated dependencies [4ddfafc]
  - @composio/core@0.1.14

## 0.1.13

### Patch Changes

- 040b5a4: Ability to create sessions for transferring request ids
- Updated dependencies [040b5a4]
  - @composio/core@0.1.13

## 0.1.12

### Patch Changes

- c1443db: Improved error handling and telemetry
- b121e73: Update packages to stable version
- f144202: Update tsdocs across all the functions
- ba8d991: Fix initiate connection flows and api issues
- ca59bcd: Update documentations and fix API discrepencies
- e51680c: Fix versioning with changesets
- 0b15376: Add custom toolkit examples
- de3f522: Stable version with test coverage and other stuff
- a2f9537: Update tools.get to accept discriminated unions
- 83a0d15: Test github ci publish
- eeec413: Rename modifiers, add docs and other miscellanious improvements
- Updated dependencies [c1443db]
- Updated dependencies [b121e73]
- Updated dependencies [f144202]
- Updated dependencies [ba8d991]
- Updated dependencies [ca59bcd]
- Updated dependencies [e51680c]
- Updated dependencies [0b15376]
- Updated dependencies [de3f522]
- Updated dependencies [a2f9537]
- Updated dependencies [83a0d15]
- Updated dependencies [eeec413]
  - @composio/core@0.1.12

## 0.1.12-alpha.16

### Patch Changes

- 0b15376: Add custom toolkit examples
- Updated dependencies [0b15376]
  - @composio/core@0.1.12-alpha.16

## 0.1.12-alpha.15

### Patch Changes

- f144202: Update tsdocs across all the functions
- Updated dependencies [f144202]
  - @composio/core@0.1.12-alpha.15

## 0.1.12-alpha.14

### Patch Changes

- 83a0d15: Test github ci publish
- Updated dependencies [83a0d15]
  - @composio/core@0.1.12-alpha.14

## 0.1.12-alpha.13

### Patch Changes

- a2f9537: Update tools.get to accept discriminated unions
- Updated dependencies [a2f9537]
  - @composio/core@0.1.12-alpha.13

## 0.1.12-alpha.12

### Patch Changes

- de3f522: Stable version with test coverage and other stuff
- Updated dependencies [de3f522]
  - @composio/core@0.1.12-alpha.12

## 0.1.12-alpha.11

### Patch Changes

- Improved error handling and telemetry
- Updated dependencies
  - @composio/core@0.1.12-alpha.11

## 0.1.12-alpha.10

### Patch Changes

- eeec413: Rename modifiers, add docs and other miscellanious improvements
- Updated dependencies [eeec413]
  - @composio/core@0.1.12-alpha.10

## 0.1.12-alpha.9

### Patch Changes

- ba8d991: Fix initiate connection flows and api issues
- Updated dependencies [ba8d991]
  - @composio/core@0.1.12-alpha.9

## 0.1.12-alpha.8

### Patch Changes

- ca59bcd: Update documentations and fix API discrepencies
- Updated dependencies [ca59bcd]
  - @composio/core@0.1.12-alpha.8

## 0.1.12-alpha.7

### Patch Changes

- e51680c: Fix versioning with changesets
- Updated dependencies [e51680c]
  - @composio/core@0.1.12-alpha.7
