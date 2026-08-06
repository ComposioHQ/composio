---
'@composio/claude-agent-sdk': patch
'@composio/core': patch
'@composio/json-schema-to-zod': patch
---

Preserve and correctly enforce root `patternProperties` and schema-valued `additionalProperties` when parsing tool schemas and registering Composio tools with the Claude Agent SDK.
