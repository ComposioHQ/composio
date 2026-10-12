---
'@composio/experimental': patch
---

Report a failed tool execution and a call that needs user input as errors from the Python workbench helpers. `run_composio_tool` returned an empty error, which reads as success, for a `failed` execution without error text and for an `input_required` answer, and `proxy_execute` returned `(None, "")` for a proxied call that needs user input. Both now return a non-empty error. For `input_required` the error says that the call needs user input and was not executed, and `run_composio_tool` returns the questions as `input_requests` without the opaque `request_state`.
