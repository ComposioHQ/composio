---
'@composio/experimental': patch
---

Stop re-sending a workbench tool execution after a network failure. The Python `run_composio_tool` helper retried a timed-out or dropped request up to three more times, so a tool the backend had already run could repeat its side effect, such as sending the same email twice. It now returns the error after the first attempt; rate-limited (429) requests still retry.
