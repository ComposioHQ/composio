---
'@composio/claude-agent-sdk': patch
'@composio/core': patch
---

Preserve root `patternProperties` and schema-valued `additionalProperties` when parsing tool schemas, and enforce root object constraints when registering Composio tools with the Claude Agent SDK.
