---
'@composio/python-sdk': patch
---

Stop emitting a `DeprecationWarning` on Python 3.14+ when registering custom tools. The async-function check now uses `inspect.iscoroutinefunction`, and async tools are still rejected as before.
