# Tool Router Session Hooks

## Decision

Add an experimental Tool Router session hook API to the TypeScript and Python SDKs. Hooks apply only to tools returned by `session.tools(...)`; they do not apply to direct `tools.execute(...)`, MCP, proxy execution, or session creation/update.

Hooks are client-side middleware around Tool Router session helper behavior. They attach to the `session.tools(...)` options surface, use an explicit `(ctx, next)` contract, and wrap the existing modifier pipeline. Existing modifiers remain the inner schema/input/output transformation layer.

## Context

The Pi provider already exposes a richer middleware surface for dynamic session helpers such as search, connection management, execution, remote workbench helpers, and auth-link routing. That surface proved useful for policies such as normalizing toolkit names, blocking tools, routing auth links out-of-band, and enforcing account selection.

The core TypeScript and Python SDKs already expose modifiers for concrete tool behavior. Modifiers are good for schema changes and before/after execution transforms, but they are not a good fit for helper orchestration such as "continue this helper call", "replace this helper result", "block this helper call as policy", or "route auth links before the model sees them".

The SDKs need a cross-language contract that keeps those concepts separate:

- Modifiers transform concrete tool schema/input/output.
- Session hooks orchestrate Tool Router session helper behavior.

## Contract

The initial hook set is:

- `search`
- `manageConnections` in TypeScript / `manage_connections` in Python
- `execute`
- `onAuthLink` in TypeScript / `on_auth_link` in Python

Remote workbench and remote bash do not get separate hooks in the first version. They flow through `execute` with their concrete tool slug when visible.

Each hook slot accepts one middleware function in the first version. Users who need multiple middleware functions can compose them in userland. The SDK will not expose `composeHooks(...)` initially.

Continuation is explicit:

- `return next()` continues.
- `return ctx.deny(reason)` returns a structured policy denial.
- `return result` replaces the operation result.
- Returning without `next()` or a replacement result is an SDK error.
- Calling `next()` more than once is an SDK error.

`ctx.deny(reason)` is available on every hook context. It represents deliberate policy blocking, not SDK failure. The denial result uses the execution-response shape plus `denied: true`:

```ts
{
  successful: false,
  error: "Blocked by policy: ...",
  data: null,
  denied: true,
}
```

User replacement results pass through as-is. The SDK validates only SDK-created results such as `ctx.deny(...)`.

Hook errors propagate by default. There is no hook-level `catchErrors` option in the first version. Users who want model-visible controlled failures should catch inside their hook and return `ctx.deny(...)` or another replacement result.

## State

Hook context is an object/class with:

- `ctx.state`
- `ctx.setState(...)` in TypeScript / `ctx.set_state(...)` in Python
- `ctx.deny(...)`
- `ctx.manageConnections(...)` in TypeScript / `ctx.manage_connections(...)` in Python where applicable

`ctx.state` is read-only. All state updates go through `setState` / `set_state`.

`setState` / `set_state` is synchronous in both SDKs. Async work happens before calling it. It accepts partial updates or synchronous updater functions and shallow-merges the returned partial state, like React state setters:

```ts
ctx.setState({ account: "acct_123" });

ctx.setState((state) => ({
  arguments: {
    ...state.arguments,
    limit: 10,
  },
}));
```

State reads reflect updates immediately after `setState` / `set_state`.

State updates are valid only before the first `next()` call. Once `next()` starts, state is frozen. Late state updates throw a clear SDK error.

## Hook State Shapes

The `search` hook can update `query` and `toolkits`.

The `manageConnections` / `manage_connections` hook can update `toolkits` and `reinitiateAll` / `reinitiate_all`.

The `execute` hook is lightweight in the first version. It exposes identity and request fields such as session id, tool slug, toolkit slug, arguments, account, and optional tool-call id when the provider runtime exposes one. It does not expose full tool schemas or connection state by default.

`execute` hooks can explicitly call `ctx.manageConnections(...)` / `ctx.manage_connections(...)` when they need connection checks or auth initiation. Connection state is not preloaded into every execute hook.

`onAuthLink` / `on_auth_link` runs once per result with all extracted auth links, not once per link. It can replace the result. It includes a `source` field because auth-link handling is cross-cutting. Source values are language-native:

- TypeScript: `"search" | "manageConnections" | "execute"`
- Python: `"search" | "manage_connections" | "execute"`

`onAuthLink` runs inside `next()`, before the outer hook resumes.

## Execution Order

Hooks are the outer middleware layer. Existing modifiers stay inside the execution pipeline:

```text
hook middleware
  -> next()
    -> existing beforeExecute modifier
    -> SDK/backend/custom-tool execution
    -> existing afterExecute modifier
  <- hook may transform returned result
```

If a hook returns a replacement result or denial without calling `next()`, existing modifiers do not run because no execution happened.

`execute` hooks target each concrete execution when the SDK can see the concrete tool slug. If execution is opaque, such as a bundled helper payload delegated to the backend, the hook sees the helper slug and raw visible state.

Hooks also apply to custom tools executed locally inside Tool Router sessions. When the SDK routes a local custom tool, hooks see the concrete custom tool slug.

## API Placement

TypeScript public types should live under `ts/packages/core/src/types/sessionHooks.types.ts`, and runtime helpers under `ts/packages/core/src/utils/sessionHooks.ts`. Export TypeScript hook types from `@composio/core` because users need them for typed hook functions.

Python implementation should live in `python/composio/core/models/_session_hooks.py`. Keep Python exports minimal at first, likely under `composio.core.models`, because Python users can write hooks structurally without importing many types.

The `hooks` option and hook types are experimental. `session.tools(...)` itself remains stable.

The first implementation should not refactor the Pi provider to reuse the new core hook runner. Pi remains prior art, and convergence can be a follow-up after the core contract lands.

## Consequences

This design keeps direct execution modifiers and session helper hooks separate. It gives users an explicit policy layer around Tool Router session tools without making hooks global backend session configuration.

The first version intentionally avoids:

- hook arrays
- a `composeHooks(...)` helper
- declarative scoping by toolkit or tool slug
- provider-name or user-id fields in hook state
- full tool schema metadata in execute hook state
- separate remote workbench or remote bash hooks
- hook-level catch behavior

Those can be added later from usage feedback without breaking the first hook contract.

## Verification

Implementation should add focused TypeScript and Python tests for:

- partial state merge and immediate state reads
- late state updates after `next()` throwing
- double `next()` calls throwing
- replacement results bypassing execution
- `ctx.deny(...)` returning a denied result
- hooks wrapping existing modifiers in the decided order
- `execute` hooks applying to locally routed custom tools
- `onAuthLink` / `on_auth_link` receiving all auth links once per result

TypeScript should add a minor changeset for `@composio/core`. Python should document the feature in changelog or release notes when preparing the next Python release, but implementation alone should not bump Python version metadata unless release prep is in scope.
