---
'@composio/vercel': minor
---

Show the model each tool's JSON Schema as is. The provider now passes the schema to the AI SDK with `jsonSchema()`, so keywords a Zod schema cannot carry, such as `format: "binary"`, `contentEncoding`, `contentMediaType`, `title`, `default`, and `examples`, reach the model. Internal `$ref`s are still inlined first. Tool-call arguments are validated with the same Zod schema as before, so the values a tool accepts and rejects are unchanged.

In strict mode the model now sees the output of the strict rewrite itself rather than a Zod rendering of it. Zod adds a `pattern` next to formats such as `email`, and strict structured outputs reject the one it adds for `email`, so a strict request with an email parameter would have failed once Zod forwarded more of the schema.

`tool.inputSchema` is now an AI SDK `Schema` instead of a Zod schema. Code that called `inputSchema.safeParse()` directly can validate with `asSchema(tool.inputSchema).validate(value)` from `ai`.
