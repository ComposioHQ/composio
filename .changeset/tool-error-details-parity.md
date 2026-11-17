---
'@composio/core': minor
'@composio/python-sdk': minor
---

Surface the server's error details on every API failure, not only the default `tools.execute` path.

**TypeScript:** `apiErrorCode` is now on `ComposioError`, derived from the `APIError` cause like `statusCode` and `requestId`, so every SDK wrapper gets it. The 429 branch, the 1803 connected-account branch, tool-fetch failures, and session/Tool Router execution now use the server's message, `suggested_fix`, status, and numeric code. Failures that never reached the API keep their original reason in the message. `ComposioConnectedAccountNotFoundError` keeps its 404 default but uses the server's status when it wraps an API error. Server-controlled error text is stripped of control characters and ANSI/OSC escapes before it reaches a message or terminal output.

**Python:** status errors raised by the SDK now expose `api_error_code`, `suggested_fix`, and `possible_fixes`, and `api_error_details(error)` gives type checkers a typed view of them. `possible_fixes` uses the server's `suggested_fix` when present and otherwise returns guidance for the HTTP status, so 401, 402, 403, 410, and 5xx no longer suggest checking the tool slug and arguments. Server-controlled text is sanitized before it reaches a message. The message already carries the server's explanation; a regression test now locks that. A tool-fetch 400/404 mapped to `ToolNotFoundError` now appends the server's message.
