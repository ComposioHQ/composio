---
'@composio/claude-agent-sdk': minor
---

Register each tool with its complete schema, so root rules reach the Claude Agent SDK.

The provider used to register a raw property shape. A raw shape is only the map of named properties, so it cannot carry any root rule. `additionalProperties` and `patternProperties` were dropped before the SDK saw them.

Two things went wrong because of that. Free-form object arguments lost their content. An argument the tool never declared was quietly removed, and the tool ran anyway.

Both are fixed. The provider now registers the whole object schema.

**What no longer works**

An undeclared argument no longer passes silently.

```ts
// The tool declares `to` and nothing else. The model also sends `hallucinated`.
{ to: 'someone@example.com', hallucinated: 'value' }

// before: `hallucinated` was stripped, and the tool ran with { to: '...' }
// now:    the caller receives an error result, and the tool does not run
```

Tools with no input parameters behave the same way. They stay closed and reject every argument.

**What to do instead**

If the model should be allowed to send extra keys, say so in the tool schema:

```json
{
  "type": "object",
  "properties": { "to": { "type": "string" } },
  "additionalProperties": true
}
```

If an argument is one the tool really accepts, declare it in `properties`. Rejection is usually the better outcome, because the agent sees the error and can correct itself instead of running with a silently dropped argument.

This brings the provider in line with `@composio/vercel`, `@composio/langchain`, and `@composio/llamaindex`, which already registered complete schemas.
