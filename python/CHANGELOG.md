# @composio/python-sdk

## 0.33.0

### Minor Changes

- 6f8a704: Custom toolkits are no longer experimental. Use `composio.customToolkits` in TypeScript and `composio.custom_toolkits` in Python. `composio.experimental.customToolkits` and `composio.experimental.custom_toolkits` are deprecated aliases of the same object and keep working. Python also exports the class as `CustomToolkits`; `ExperimentalCustomToolkits` stays as an alias.

### Patch Changes

- 55d8924: Preserve the originating `tool_use_id` in Python Anthropic tool results and retain session execution status, log IDs, and returned Instant charges in provider execution results. Clarify the TypeScript Anthropic helpers' existing result projection and message correlation in their API documentation.
- f74ef60: Include `blocked` in the Python session execution result type so blocked results can be parsed by `ToolRouterSessionExecuteResponse`.
- 54949b2: Exclude the Claude Agent SDK provider's tests package from its wheel to avoid shadowing consuming projects' tests.
- 19a7a09: Update the API client dependencies to 2.1.32 to include the latest API changes.
- 6dde98e: Stop emitting a `DeprecationWarning` on Python 3.14+ when registering custom tools. The async-function check now uses `inspect.iscoroutinefunction`, and async tools are still rejected as before.
- 495be0f: Fix `composio_google` raising `ParseError` while wrapping tools whose schemas use JSON Schema keywords outside the Vertex AI `Schema` subset, such as `human_parameter_name`, `examples`, `const`, `oneOf`, type lists, and non-string enums. `wrap_tool` now reduces each schema to that subset: it drops unsupported keywords, turns `oneOf` into `anyOf`, a `null` type or enum member into `nullable`, a string `const` into a one-value `enum`, and moves non-string enum values into the description.
- 39fc590: Allow OpenAI Agents SDK 0.21 in the TypeScript provider's peer dependencies. Require composio 0.32.0 or newer for the Python OpenAI Agents provider so installs cannot retain an older core.
- bd26f32: Match the `toolkit` filter of trigger subscriptions for toolkits whose slug contains an underscore

  The toolkit of an incoming event is derived from the first `_` segment of its trigger slug, so `ONE_DRIVE_FILE_CREATED_TRIGGER` was attributed to `ONE` and `handle(toolkit="one_drive")` skipped every OneDrive event. The same happened to `launch_darkly` and `agent_mail`. A `toolkit` filter now also matches when the trigger slug starts with `<toolkit>_`.

- 4ee12da: Use generated client types for inline local-tool payloads and share Python result handling between session tool and meta-tool execution. Public methods and request and response shapes are unchanged.
- d5c1861: Update runtime dependencies, require patched Zod 4 releases where used directly, support Anthropic SDK 1.6, and update the AutoGen provider's FLAML dependency. Preserve Zod 3 compatibility fixtures and existing framework version boundaries.

## 0.32.0

### Minor Changes

- f22ab26: Update `composio-client` to 2.1.0. Breaking (experimental API): `composio.experimental.custom_toolkits.create()` and `upsert()` take the MCP server URL as `mcp_url` instead of `app_url`.
- f22ab26: Renames in-process custom tools to local tools, so they are no longer confused with the server-side custom toolkits on `composio.experimental.custom_toolkits`. Pass `experimental={"local_tools": ..., "local_toolkits": ...}` to `composio.create()`, and `local_tools=` and `local_toolkits=` to `composio.use()`. List them with `session.local_tools()` and `session.local_toolkits()`. The types are now `LocalTool`, `LocalToolkit`, `RegisteredLocalTool` and `RegisteredLocalToolkit`. The `custom_tools` and `custom_toolkits` options and session methods still work but emit `ComposioDeprecationWarning`, and the `Custom*` type names remain as aliases. Passing both a new option and its deprecated alias raises `InvalidParams`. The request sent to the API is unchanged.
- f22ab26: `wait_for_connection()` handles rate limits: the delay between polls grows from 1 to 5 seconds, and a poll rejected with a 429 waits as long as its `Retry-After` header asks (up to the timeout) and polls again instead of failing the wait. A NaN timeout now times out instead of polling forever.

### Patch Changes

- f22ab26: The error for a missing API key now explains how to set `COMPOSIO_API_KEY` or pass `api_key=`, and links to where to get a project API key, instead of suggesting `composio login`, which the Python package doesn't install.
