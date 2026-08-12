# @composio/json-schema-to-zod

## 0.3.0

### Minor Changes

- 5e57815: Keep the content of free-form object arguments, and apply dynamic key rules only where they belong.

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

## 0.2.2

### Patch Changes

- 1503786: Model the parser-supported `min`, `max`, and `example` JSON Schema extensions in the exported recursive schema type.

## 0.2.1

### Patch Changes

- 58bc93b: Refresh dependency ranges and lockfiles across the workspace.
- fa933a6: Fix the `homepage` links in these packages' `package.json`. They pointed at `github.com/ComposioHQ/composio/tree/main/...`, but the default branch is `next` and no `main` branch exists, so every link 404'd on npm and in editor tooltips. They now point at `tree/next/...`.

## 0.2.0

### Minor Changes

- 025a657: Drop CommonJS entrypoints and publish the TypeScript SDK packages as ESM-only packages. This is a breaking change within the existing 0.x release line: consumers must use Node.js 22.22.3 or newer. CommonJS callers can only rely on Node's native `require(esm)` interop, and the SDK no longer ships custom CommonJS compatibility machinery or `.cjs` artifacts.

## 0.1.20

### Patch Changes

- eec8fd9: Bump SDK version for latest changes

## 0.1.19

### Patch Changes

- b5cc23f: Fix dangerously skip version check in non agentic providers, Throw error instead of process.exit when api key doesn't exist, bump zod-to-json-schema to 3.25.0, which supports "zod/3"

## 0.1.18

### Patch Changes

- cfc2c50: Update zod version to 4

## 0.1.17

### Patch Changes

- 157bf7b: Fix array parsing

## 0.1.16

### Patch Changes

- 8741165: Add zod 4 support via zod/v3 and fix zod schema parsing

## 0.1.15

### Patch Changes

- 51033d8: Fix additional properties in nested structures

## 0.1.14

### Patch Changes

- 5027e18: Fix openai responses schema parsing

## 0.1.13

### Patch Changes

- Fix parsing of additional properties

## 0.1.12

### Patch Changes

- Fix additionalProperties to be always present

## 0.1.11

### Patch Changes

- Fix jsonSchema to zod parsing which used to eliminate min/max and examples proeperties

## 0.1.10

### Patch Changes

- 7276d1e: Fix issues with json schema to zod parsing causing nested objects to be marked as required
- 7276d1e: Fix issues with objects with default values being marked as required
- 06612f5: Downgrade chalk to v4 to allow CJS as well
- 77e96e4: Fix JSON Schema to Zod Parsing
- cb1b401: Bump packages for authconfig fixes
- Create stable release

## 0.1.10-next.5

### Patch Changes

- 77e96e4: Fix JSON Schema to Zod Parsing

## 0.1.10-next.4

### Patch Changes

- Bump packages for authconfig fixes

## 0.1.10-next.3

### Patch Changes

- 06612f5: Downgrade chalk to v4 to allow CJS as well

## 0.1.10-next.2

### Patch Changes

- Downgrade chalk to v4 to allow CJS as well

## 0.1.10-next.1

### Patch Changes

- Fix issues with objects with default values being marked as required

## 0.1.10-next.0

### Patch Changes

- Fix issues with json schema to zod parsing causing nested objects to be marked as required

## 0.1.9

### Patch Changes

- Add host name support in SDK

## 0.1.8

### Patch Changes

- 1ab34ef: Fix json schema support in tools

## 0.1.7

### Patch Changes

- c8e89d5: Fix telemetry transport

## 0.1.6

### Patch Changes

- 37a1f01: Feat better connected account creation flow

## 0.1.5

### Patch Changes

- df31cc2: Fix json schema parsing

## 0.1.2

### Patch Changes

- f943ba4: Export all the types from the core SDK

## 0.1.2

### Patch Changes

- 208e320: Update json schema transformations issues related to strict mode

## 0.1.1

### Patch Changes

- 4ddfafc: Add json schema to zod schema
