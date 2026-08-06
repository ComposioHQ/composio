---
'@composio/core': minor
---

Keep root `patternProperties` and `additionalProperties` when parsing a tool schema.

`ToolSchema.parse` used to drop root `patternProperties` as an unknown key, and it rejected a root `additionalProperties` written as a schema instead of a boolean. Both constraints were lost before any converter or provider could read them. They now survive parsing exactly as written.

This matters downstream. Every provider reads `inputParameters` after parsing, so a tool that declares dynamic keys had those rules stripped before the model ever saw them.

An omitted `additionalProperties` still stays omitted. The parser does not invent a value, because each converter decides its own default.

**What no longer works**

Parsing no longer fails on a schema-valued root `additionalProperties`.

```ts
const tool = ToolSchema.parse({
  slug: 'MY_TOOL',
  inputParameters: {
    type: 'object',
    properties: { name: { type: 'string' } },
    additionalProperties: { type: 'number' },
  },
  // ...
});

// before: parsing failed, because only a boolean was accepted
// now:    tool.inputParameters.additionalProperties is { type: 'number' }
```

**What to do instead**

Nothing, if you only ever passed boolean values. That case is unchanged.

If your code assumed `inputParameters` never carries `patternProperties`, or that `additionalProperties` is always a boolean, widen that assumption. Both keywords can now appear, and `additionalProperties` can be a boolean or a schema object.
