---
'@composio/llamaindex': patch
---

Show the model each tool's JSON Schema as is. The provider now builds the `FunctionTool` with the JSON Schema as its parameters and the Zod schema as its validator, instead of letting LlamaIndex render the Zod schema back to JSON Schema. Keywords such as `format: "binary"`, `contentEncoding`, `contentMediaType`, and `title` reach the model. Internal `$ref`s are still inlined first, and the values a tool accepts and rejects are unchanged.
