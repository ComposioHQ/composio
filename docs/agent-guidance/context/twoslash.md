# TypeScript snippet checking

Production Twoslash validates TypeScript fences in build-covered MDX collections. `check:typescript-snippets` covers maintained API overviews, authored reference pages, and plain-Markdown FAQ/KB inputs that the build does not type-check. These are complementary checks, not a claim that every rendered code block is compiled.

Python has a separate syntax/mypy gate; see `code-examples.md`.

## Commands and coverage

Run from `docs/`:

```bash
bun run check:typescript-snippets
GITHUB_ACTIONS=true bun run build
```

- Build-time Twoslash is disabled during `bun dev` to avoid its development memory cost.
- `source.config.ts` configures collection-level MDX behavior. The reference collection has no Twoslash transformer; its maintained examples are checked by the standalone command instead.
- Plain-Markdown FAQs and canonical/curated KB inputs are checked before their presentation conversion. Generated KB TypeScript stays TypeScript and is also checked when built.
- Generated SDK symbol-reference signatures/partial fragments and historical changelogs are inventory-only, not certified by the maintained-example gates.
- `.github/workflows/docs-typescript-check.yml` runs standalone regressions, the standalone gate, lint, type checking, and the production build.
- Imports resolve to the versions installed from `docs/package.json` and `docs/bun.lock`. This does not type-check against the local TypeScript SDK workspace.

## Complete examples and hidden setup

Prefer explicit imports and initialization. Use `// ---cut---` when setup is necessary but should not be displayed; hidden code is still checked.

````md
```typescript
import { Composio } from '@composio/core';
const composio = new Composio({ apiKey: 'key' });
const userId = 'user_123';
// ---cut---
const tools = await composio.tools.get(userId, { toolkits: ['GITHUB'] });
```
````

The standalone checker can supply the conventional `composio` fragment binding only when the compiler reports that name unresolved. It does not replace a local declaration, imported alias, or nested parameter. New complete examples should not depend on that compatibility prelude.

## Callback types

Use SDK-exported types instead of recreating callback interfaces:

````md
```typescript
import type { TransformToolSchemaModifier } from '@composio/core';

const modifySchema: TransformToolSchemaModifier = ({ schema }) => schema;
```
````

Other exported modifier types include `beforeExecuteModifier` and `afterExecuteModifier`.

## Diagnostics and annotations

| Annotation | Effect |
|---|---|
| `// ---cut---` | Hide setup from readers, not the compiler |
| `// ^?` | Show the inferred type |
| `// @errors: 2322` | Twoslash presentation metadata; the standalone gate still reports actual errors |
| `// @ts-expect-error` | Suppress one documented typing mismatch; must explain the verified SDK/type gap |

Do not add blanket `@noErrors`, `@noErrorsCutted`, `@noCheck`, or `@ts-nocheck` to make a current example pass. The standalone checker rejects these directives and reports the underlying diagnostics. Some older build-only examples retain Twoslash suppression; their presence is a validation limit, not evidence that the code compiles.

For an unavailable dependency, add the dependency through the package manager when it belongs in the supported docs toolchain. For a genuine missing SDK operation, keep the language option and explain the gap in a Callout. Do not invent types or broadly suppress errors to make the tabs appear equivalent.

## Troubleshooting

| Failure | Action |
|---|---|
| Import cannot resolve | Check the installed docs dependencies and lockfile |
| Name cannot resolve | Add explicit initialization or a narrowly scoped hidden declaration |
| Argument or callback mismatch | Compare with the installed SDK signature; use exported types |
| Generated KB error | Edit its `kb/articles` source and corresponding canonical `kb/source` article, then regenerate |
| Reference example error | Edit `api-overviews` for generated overviews, or the authored reference source |

Static type checking does not establish that requests have equivalent defaults, filters, identities, permissions, or output. Review those against SDK behavior and the OpenAPI contract, then inspect the built tabs and agent Markdown.
