---
'@composio/anthropic': patch
---

Sanitize tool `input_schema` property keys that violate Anthropic's `^[a-zA-Z0-9_.-]{1,64}$` constraint before sending tools to the Messages API, then restore the original names when the tool is executed.

A single non-conforming key previously made Anthropic reject the entire `tools` array with HTTP 400, taking down every other tool in the same request. This commonly happened with OneDrive's Microsoft Graph OData parameters (`$top`, `$filter`, `@microsoft.graph.conflictBehavior`) and with over-long flattened keys from tools such as Zoom. Offending keys are now rewritten to conforming aliases (`$` → `dollar_`, `@` → `at_`, any other illegal character → `_`, keys longer than 64 characters truncated with a deterministic suffix), recursing through nested object `properties` and array `items` schemas. The original parameter names are restored before the call reaches the Composio backend, so the model sees `dollar_top` while the backend still receives `$top`. Schemas whose keys already conform are left unchanged.
