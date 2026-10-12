# @composio/slim

## 0.23.0

### Minor Changes

- 55ed9e2: Update the owned API client to `@composio/client@2.0.0-rc.11`.

  A session tool can now ask for user input, such as an approval, instead of running: the API answers the call with `result_type: "input_required"`. `session.execute()`, `session.proxyExecute()`, provider-wrapped session tools, and the `execute` / `proxyExecute` helpers passed to custom tools throw the new `ComposioToolInputRequiredError` in that case. A local custom tool whose body makes such a call lets the error through instead of returning it as a failed result. The error carries the questions on `inputRequests` and the opaque `request_state` on `requestState`. `requestState` is continuation state, so it is a non-enumerable property: read it as `error.requestState`, and `console.error(error)`, `util.inspect(error)` and `JSON.stringify(error)` leave it out. Nothing was executed and the call is not retried. The SDK does not submit answers yet.

  Every session tool that ran reports `result_type` as `completed` or `failed`, and a failed execution can carry a `null` or empty `error`. `session.execute()` and the custom tool `execute` helper return it as the new `resultType`, which is always present; read it rather than `error` to tell a failure from a success. Provider-wrapped session tools, provider tool calls bound to a session, and the merged `COMPOSIO_MULTI_EXECUTE_TOOL` result set `successful` from it alone, so a failure without error text is no longer reported as successful. `error` is returned as the API sent it. A session execute answer without `result_type`, or with a value this SDK does not know, throws `ValidationError` instead of being read as a success or a failure.

  A `COMPOSIO_MULTI_EXECUTE_TOOL` batch that mixes local custom tools with remote tools now throws `ComposioToolInputRequiredError` when the remote half needs user input, as an all-remote batch already did. It used to report the input request as a failure message on each remote tool, without `inputRequests` or `requestState`. Local tools in that batch have already run by then, and their results are discarded by the throw.

  Breaking changes:

  - `ToolRouterSessionConfig` (`session.config`, the result of `session.update()`) and `ToolRouterSessionConfigHistoryConfig` (`session.listConfigHistory()`) are now the client's own config types. `instant` is always present (`false` or the policy object) instead of optional.
  - In those config types, `toolkits` and each `tools` entry can be a `{ require_approval }`-only object, so a check for `enabled` or `disabled` no longer covers every case. `tags` can carry `require_approval`, and the config can carry `proxy_execute`.
  - The session config is returned as the API sent it. The SDK no longer validates `instant` at runtime or removes a `premium_usage` key.
  - `ToolRouterSessionExecuteResponse` requires `resultType`. A custom `ToolCallSession` passed to a provider must return it from `execute()`, because `successful` is no longer derived from `error`.
  - Removed the unused `ToolRouterInstantResponseSchema` and `ToolRouterInstantResponse` exports. Use `ToolRouterSessionConfig['instant']` for the Instant policy the API returns.

### Patch Changes

- 67e80e3: Update the owned API client to `@composio/client@2.0.0-rc.9`.
- a7b4943: Send product identity, product version, language, and runtime version with API requests. Identify installed core and slim packages separately while preserving existing telemetry headers.
- Updated dependencies [077ceb3]
- Updated dependencies [d9f6291]
  - @composio/json-schema-to-zod@0.3.4

## 0.22.0

### Patch Changes

- 485c09d: Refresh runtime dependencies and support Anthropic SDK 0.127 in the Anthropic provider.

## 0.21.0

No changes in this release.

## 0.20.0

No changes in this release.

## 0.19.0

### Minor Changes

- efc2e52: Keep TypeScript realtime subscription errors inside the SDK logging boundary so an asynchronous Pusher subscription failure cannot escape as an uncaught exception. The full subscription error payload is now logged, the success message is logged only once Pusher confirms the subscription, and `PusherService.subscribe` / `Triggers.subscribe` accept an optional `onSubscriptionError` callback so applications can react to subscription failures programmatically.

### Patch Changes

- 62e51e8: Refresh runtime dependencies and extend provider peer compatibility to the latest supported Anthropic and OpenAI Agents SDK releases.
- 7055914: Move published dependency ranges to their current upstream releases: zod 4.5, openai 7.10, typebox 1.3.27, @mastra/schema-compat 1.3.8, and @cloudflare/workers-types 5.20260905. `@composio/anthropic` also accepts `@anthropic-ai/sdk` 0.124 as a peer, the line it is now tested against.
- 85996c4: Drop `Authorization`, `Proxy-Authorization`, and `Cookie` from the request headers when the SSRF guard follows a redirect to a different origin, as the Fetch standard does for automatic redirects. Same-origin redirects keep them.
- Updated dependencies [b4b9fc4]
  - @composio/json-schema-to-zod@0.3.3

## 0.18.1

### Patch Changes

- Updated dependencies [ab289d6]
  - @composio/json-schema-to-zod@0.3.2

## 0.18.0

### Patch Changes

- db7b576: Declare Node.js 22.22.3 as the minimum supported runtime for every published TypeScript package so package managers surface incompatible runtimes before users encounter ESM loading failures.
- Updated dependencies [db7b576]
  - @composio/json-schema-to-zod@0.3.1

## 0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [5e57815]
  - @composio/json-schema-to-zod@0.3.0

## 0.15.0

### Patch Changes

- e5c9ada: Refresh the OpenAI runtime dependency to version 7.
- Updated dependencies [1503786]
  - @composio/json-schema-to-zod@0.2.2

## 0.14.1

### Patch Changes

- 503b50a: Refresh runtime dependencies across the TypeScript SDK packages.

## 0.14.0

### Patch Changes

- 58bc93b: Refresh dependency ranges and lockfiles across the workspace.
- fa933a6: Fix the `homepage` links in these packages' `package.json`. They pointed at `github.com/ComposioHQ/composio/tree/main/...`, but the default branch is `next` and no `main` branch exists, so every link 404'd on npm and in editor tooltips. They now point at `tree/next/...`.
- Updated dependencies [58bc93b]
- Updated dependencies [fa933a6]
  - @composio/json-schema-to-zod@0.2.1

## 0.13.1

## 0.13.0

### Minor Changes

- d17a268: Add a slim Composio core package that mirrors the built `@composio/core` runtime and types without publishing the packaged `docs/` or `src/` trees.
