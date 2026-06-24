# eve provider for Composio

A Composio **provider** for the [eve](https://github.com/vercel/eve) agent framework, and the seed of a future `@composio/eve` package. It implements `BaseAgenticProvider`, so `session.tools()` returns eve-native `defineTool`s (catalog meta-tools plus preloaded custom tools). It's built like Composio's other framework providers (Vercel, LangChain, and so on).

```
eve-provider/
  index.ts      barrel: public API
  provider.ts   EveProvider (wrapTool / wrapTools / wrapMcpServerResponse)
  resolver.ts   defineComposioTools: the replay-safe step.started resolver
  hooks.ts      hook types + runHook + applyHooks + denyEveToolCall
```

## Usage

```ts
import { Composio } from "@composio/core";
import { EveProvider, defineComposioTools } from "./eve-provider/index.js";

// 1. register the provider on the client
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new EveProvider(),
});
const session = composio.create(userId, { /* toolkits, customToolkits, … */ });

// 2. expose the tools to eve from agent/tools/<name>.ts
export default defineComposioTools(session);
```

`defineComposioTools(session)` is the only thing the app touches: it returns a `defineDynamic` resolver that hands eve `session.tools()`. It encapsulates the two non-obvious requirements (below) so consumers can't get them wrong.

## How it works

A provider turns Composio tools into a target framework's tool shape. `EveProvider`:

- `wrapTool(tool, executeTool)` → one eve `defineTool`. Runs args through `normalizeToolArguments`, honors `strict` via `removeNonRequiredProperties`, returns the full `ToolExecuteResponse`.
- `wrapTools(tools, executeTool)` → `Record<slug, eveTool>`.
- `wrapMcpServerResponse(data)` → eve-shaped MCP server URLs.

**eve-specific detail:** eve's `defineTool` takes plain **JSON Schema**, so we pass `inputParameters` straight through. Converting to a zod schema trips eve's normalizer (its Standard Schema path wants a `jsonSchema` method `zod/v3` doesn't expose).

**Why `defineComposioTools` resolves on `step.started`, not `session.started`:** the wrapped `execute` closes over Composio's live `executeTool` function. eve keeps a dynamic tool's live `execute` only for **step-scoped** tools (it re-resolves them each step); session/turn-scoped tools are snapshotted to serializable metadata, so a captured function can't survive. The resolver also **memoizes** `session.tools()` (a network call) so it fetches once per session.

## Hooks

Optional middleware around the Tool Router meta-tools, modeled on the [Pi provider's hooks](https://docs.composio.dev/docs/providers/pi#hooks). Pass them to the constructor:

```ts
new EveProvider({
  hooks: {
    search: (ctx, next) => {              // rewrite the request
      ctx.request.args.toolkits = ["github"];
      return next();
    },
    execute: (ctx, next) =>               // block a call
      ctx.request.args.dangerous ? ctx.deny("not allowed") : next(),
    onAuthLink: async (ctx, next) => {    // intercept auth links
      await sendLinkOutOfBand(ctx.url);
      return next();
    },
  },
});
```

Each hook is `(ctx, next)`: `await next()` runs the call, a returned value **replaces** the result, `ctx.deny(reason)` blocks it. `ctx.request` is mutable; `ctx.context` is read-only. Hooks key off slug (`search` → `COMPOSIO_SEARCH_TOOLS`, `execute` → `COMPOSIO_MULTI_EXECUTE_TOOL`, …); `onAuthLink` fires once per Composio auth link found in a result.

## Extracting to `@composio/eve`

This folder is the package, minus the wrapper. To publish:

1. **`package.json`** with peer deps `@composio/core` and `eve`; `exports` pointing at the built `index`.
2. Build to ESM + `.d.ts` (the source is already pure ESM with explicit `.js` import specifiers).
3. Tests for `wrapTool` (schema passthrough), `runHook` (memoized `next`, deny, replace), and auth-link extraction.

Optional, for pin-for-pin parity with the Pi provider: add a `createSessionTools(capabilities)` layer that builds its own helper tools with **typed per-helper hook contexts** (`request.query`, `request.toolSlug`, …) and a session-agnostic `capabilities` ({ search, execute, connections, hooks }) input. The current hooks operate on the real meta-tools (generic `request.args`), which keeps the `session.tools()` passthrough, the idiomatic eve path.
