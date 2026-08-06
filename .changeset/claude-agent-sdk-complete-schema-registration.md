---
'@composio/claude-agent-sdk': minor
---

Register tools with their complete Zod object schema instead of a raw property shape, so root-level constraints survive registration.

A raw shape is only the per-property map, so `additionalProperties` — boolean or schema-valued — and `patternProperties` were structurally unrepresentable and dropped before the Claude Agent SDK ever saw them. Free-form object arguments lost the content they exist to carry, and unknown keys were silently stripped from tool input rather than rejected.

Behavior change: a tool whose schema names properties and omits `additionalProperties` is strict, so an argument the model invents now fails validation with an MCP invalid-params error instead of being quietly removed before execution. Tools with no input parameters stay closed for the same reason.
