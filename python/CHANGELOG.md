# @composio/python-sdk

## 0.33.0

### Minor Changes

- 6f8a704: Custom toolkits are no longer experimental. Use `composio.customToolkits` in TypeScript and `composio.custom_toolkits` in Python. `composio.experimental.customToolkits` and `composio.experimental.custom_toolkits` are deprecated aliases of the same object and keep working. Python also exports the class as `CustomToolkits`; `ExperimentalCustomToolkits` stays as an alias.
- 84fb5ba: Surface the server's error details on every API failure, not only the default `tools.execute` path.

  **TypeScript:** `apiErrorCode` is now on `ComposioError`, derived from the `APIError` cause like `statusCode` and `requestId`, so every SDK wrapper gets it. The 429 branch, the 1803 connected-account branch, tool-fetch failures, and session/Tool Router execution now use the server's message, `suggested_fix`, status, and numeric code. Failures that never reached the API keep their original reason in the message. `ComposioConnectedAccountNotFoundError` keeps its 404 default but uses the server's status when it wraps an API error. Server-controlled error text is stripped of control characters and ANSI/OSC escapes before it reaches a message or terminal output.

  **Python:** status errors raised by the SDK now expose `api_error_code`, `suggested_fix`, and `possible_fixes`, and `api_error_details(error)` gives type checkers a typed view of them. `possible_fixes` uses the server's `suggested_fix` when present and otherwise returns guidance for the HTTP status, so 401, 402, 403, 410, and 5xx no longer suggest checking the tool slug and arguments. Server-controlled text is sanitized before it reaches a message. The message already carries the server's explanation; a regression test now locks that. A tool-fetch 400/404 mapped to `ToolNotFoundError` now appends the server's message.

### Patch Changes

- 55d8924: Preserve the originating `tool_use_id` in Python Anthropic tool results and retain session execution status, log IDs, and returned Instant charges in provider execution results. Clarify the TypeScript Anthropic helpers' existing result projection and message correlation in their API documentation.
- f74ef60: Include `blocked` in the Python session execution result type so blocked results can be parsed by `ToolRouterSessionExecuteResponse`.
- 54949b2: Exclude the Claude Agent SDK provider's tests package from its wheel to avoid shadowing consuming projects' tests.
- 19a7a09: Update the API client dependencies to 2.1.33 to include the latest API changes.
- 6dde98e: Stop emitting a `DeprecationWarning` on Python 3.14+ when registering custom tools. The async-function check now uses `inspect.iscoroutinefunction`, and async tools are still rejected as before.
- 23360bb: Stop connection polling at the deadline after a rate-limited response. When a `429` with `Retry-After` reaches the timeout, `waitForConnection()` and `wait_for_connection()` now time out instead of sending another status request with a fresh client retry cycle.
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
