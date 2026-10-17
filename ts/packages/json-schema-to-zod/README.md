# Json-Schema-to-Zod

A package to convert JSON schema (draft 4+) objects into Zod schemas in the form of Zod objects at runtime.

## Installation

```sh
npm install @composio/json-schema-to-zod
```

### Simple example

```typescript
import { jsonSchemaToZod } from '@composio/json-schema-to-zod';

const jsonSchema = {
  type: 'object',
  properties: {
    hello: {
      type: 'string',
    },
  },
};

const zodSchema = jsonSchemaToZod(jsonSchema);
```

The root entry builds Zod v3 schemas (`zod/v3`), which every supported zod release ships.

### Object-level keywords and `jsonSchemaToZodShape`

`jsonSchemaToZodShape` converts each entry of `properties` on its own, so assertions that apply to the object as a whole have no place in the shape and are not enforced: `minProperties`, `maxProperties`, `propertyNames`, `uniqueItems`, or a `required` key with no declared property. Keywords on a property (`{ uniqueItems: true, type: 'array' }` as a property schema) are still enforced. When the object-level assertions must hold, use `jsonSchemaToZod`, or check them yourself on the `z.object(shape)` you build.

### Zod v4 schemas

The `/v4` entry builds classic Zod v4 schemas (`zod/v4`) with the same function names, so a caller switches by changing the import path:

```typescript
import { jsonSchemaToZod, jsonSchemaToZodShape } from '@composio/json-schema-to-zod/v4';

const zodSchema = jsonSchemaToZod(jsonSchema);
const shape = jsonSchemaToZodShape(jsonSchema);
```

Both builders accept and reject the same values. Beyond that, the v4 builder forwards the JSON Schema annotations a serializer cannot derive from the schema's checks, so `z.toJSONSchema()` and the frameworks built on it see them again:

- `format`, verbatim, including values such as `binary`, `int64`, and `time`;
- `contentEncoding` and `contentMediaType`, verbatim;
- `type: "integer"`, since the integer check is a refinement that accepts every integral number, as the root builder and JSON Schema do;
- the description, title, and examples text the root builder also writes.

Pass `{ withoutAnnotations: true }` to leave the annotations out; `{ withoutDescribes: true }` leaves out the description, as it does for the root entry.

`/v4` requires zod `>= 4.1.13`: importing it under an older release throws at load time. 4.1.13 is the first release whose `zod/v4` shares its metadata registry across copies through `globalThis`. That check covers only the zod copy that builds the schema. If the code that serializes the schema loads its own copy of zod below 4.1.13 (a framework that depends on zod directly rather than as a peer), that copy reads a separate registry and the descriptions and annotations are lost. Keep every zod copy in the process at 4.1.13 or later.

### Overriding a parser

You can pass a function to the `parserOverride` option, which represents a function that receives the current schema node and the reference object, and should return a zod object when it wants to replace a default output. If the default output should be used for the node just return undefined.

## Acknowledgements

This is a fork of [`json-schema-to-zod`](https://github.com/StefanTerdell/json-schema-to-zod).
