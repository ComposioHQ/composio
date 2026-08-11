---
'@composio/json-schema-to-zod': minor
---

Keep the content of free-form object arguments, and apply dynamic key rules only where they belong.

An object schema with no named properties, written as `{ "type": "object" }` or `{ "properties": {} }`, used to become a strict empty object. The only value that passed was `{}`. Any real payload was rejected. Such an object is now open, so arbitrary content is accepted and preserved. This works at the root, nested inside another object, and inside array items.

Dynamic keys are now routed to the schemas that actually claim them. Every matching `patternProperties` entry validates its key. A schema-valued `additionalProperties` applies only to keys that no declared property and no pattern matches. Before this change a key could pass by satisfying an unrelated pattern instead of its own.

**What no longer works**

Converting a property-less object no longer gives you a schema that rejects everything.

```ts
const schema = jsonSchemaToZod({ type: 'object' });

schema.parse({ anything: 1 });
// before: threw, because the result was z.object({}).strict()
// now:    returns { anything: 1 }
```

**What to do instead**

If you want a property-less object to stay closed, say so in the JSON Schema:

```ts
const schema = jsonSchemaToZod({ type: 'object', additionalProperties: false });

schema.parse({ anything: 1 }); // throws, as before
```

Objects that name at least one property are unchanged. They still reject unknown keys when `additionalProperties` is omitted.
