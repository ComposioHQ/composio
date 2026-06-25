# Twoslash - TypeScript Code Block Type Checking

**ALL TypeScript code blocks are type-checked at build time.** This ensures documentation stays in sync with the SDK.

> **Note**: This only validates TypeScript (`ts`, `typescript`, `tsx`) code blocks. Python code blocks are NOT type-checked.

## Key Features

- **Default on**: All TypeScript blocks are validated. No annotation needed.
- **Build-time validation**: Type errors fail the build.
- **CI enforcement**: `.github/workflows/docs-typescript-check.yml` runs on PRs to docs/
- **Disabled in dev**: Twoslash is disabled during `bun dev` to prevent heap memory issues. It only runs during `bun run build` / CI.

## Exclusions

- **Reference docs** (`/content/reference/`): Excluded from Twoslash via collection-level `mdxOptions` in `source.config.ts`. These are auto-generated and don't need type checking.

## Common Patterns

### Basic snippet with setup code (hidden from output)

````md
```typescript
import { Composio } from '@composio/core';
const composio = new Composio({ apiKey: 'key' });
const userId = 'user_123';
// ---cut---
// Only code below this line is shown in docs
const tools = await composio.tools.get(userId, { toolkits: ['GITHUB'] });
```
````

### Using SDK-exported types for callbacks

The SDK exports types for modifiers - use them instead of inline type annotations:

````md
```typescript
import { Composio, TransformToolSchemaModifier } from '@composio/core';

const modifySchema: TransformToolSchemaModifier = ({ toolSlug, toolkitSlug, schema }) => {
  // TypeScript infers all parameter types!
  return schema;
};
```
````

Available modifier types from `@composio/core`:
- `beforeExecuteModifier` - for `beforeExecute` callbacks
- `afterExecuteModifier` - for `afterExecute` callbacks
- `TransformToolSchemaModifier` - for `modifySchema` callbacks

### Skip type checking (for partial snippets or external deps)

````md
```typescript
// @noErrors
import { SomeExternalThing } from 'not-installed-package';
```
````

### Declare external variables in hidden section

When code uses variables that aren't defined in the snippet, declare them before the cut:

````md
```typescript
import { Composio } from '@composio/core';

declare const composio: Composio;
declare const userId: string;
// ---cut---
const tools = await composio.tools.get(userId, { toolkits: ['GITHUB'] });
```
````

## Annotations

| Annotation | Purpose |
|------------|---------|
| `// ---cut---` | Hide code above from output (but include for compilation) |
| `// @noErrors` | Skip all type checking for this block |
| `// @errors: 2322` | Expect specific error code (won't fail build) |
| `// ^?` | Show type on hover at that position |

## Configuration

- **Config**: `source.config.ts` - `transformerTwoslash({ explicitTrigger: false })`
- **SDK packages**: Installed as devDependencies for import resolution
- **Reference exclusion**: Uses `applyMdxPreset` with custom `rehypeCodeOptions` (no twoslash transformer)

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Import fails | Ensure the package is in `devDependencies` |
| External dependency | Use `// @noErrors` for examples with packages not in package.json |
| Setup code needed | Use `// ---cut---` to add imports/declarations that compile but aren't shown |
| Error code 2304 | "Cannot find name" - declare the variable in hidden section |
| Error code 2322 | Type mismatch - fix the types or use SDK-exported types |
| Callback types | Prefer importing SDK types over inline `{ foo: string }` annotations |

Always run `bun run build` locally to validate all code blocks before pushing.
