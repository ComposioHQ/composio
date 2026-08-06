---
'@composio/core': minor
---

Preserve root `patternProperties` and boolean- or schema-valued `additionalProperties` when parsing tool parameters. `ToolSchema.parse` previously stripped `patternProperties` as an unknown key and rejected a schema-valued `additionalProperties` outright, so both dynamic-key constraints were lost before any converter could see them.
