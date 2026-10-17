# @composio/slim

## 0.26.0

### Minor Changes

- e08c84f: Requires `@composio/client` `2.0.0-rc.18`. The SDK now hands the API client its credential as the client's `auth` option and its organization and project as `scope`, instead of placing them in default headers. The `apiKey`, `userApiKey`, `orgApiKey`, `orgId` and `projectId` options, their environment fallbacks and the credentials sent on each request are unchanged, with one exception: with `apiKey: null` and only an organization API key (the `orgApiKey` option, `COMPOSIO_ORG_API_KEY`, or an `x-org-api-key` default header), every request now carries `x-org-api-key`, and so do trigger channel authorization and `session.mcp.headers`. Before, only the organization-owner operations did, and every other request went out without a credential.

  Credential and scope headers in `defaultHeaders` or `createSession({ headers })` keep working, but the SDK folds them into its own options instead of forwarding them: an `x-user-api-key` or `x-org-api-key` entry becomes the credential every request carries, an `x-api-key` entry becomes the project key, and `x-org-id` / `x-project-id` entries become `orgId` / `projectId`. `getConfig()` reports the folded values (for example `apiKey: null` and `userApiKey` for an `x-user-api-key` entry) and no longer lists those entries under `defaultHeaders`. Setting more than one of `x-api-key`, `x-user-api-key` and `x-org-api-key` now throws a `ComposioError`; the API rejected every such request.

  On the client returned by `getClient()`, `apiKey`, `userApiKey` and `orgApiKey` are read-only and deprecated (read the keys from `getConfig()`, or `authMode` and `scope` from the client), and a per-call `headers` option can no longer name a credential or scope header. The API client no longer reads the environment itself: the SDK still honours `COMPOSIO_ALLOW_INSECURE_HTTP=1`, and no longer applies `COMPOSIO_CUSTOM_HEADERS`; pass `defaultHeaders` instead.

  The deprecated `customConnectionData` now requires `val.access_token` for `S2S_OAUTH2`, as the API does.

- 57de614: Requires `@composio/client` `2.0.0-rc.19`. The SDK forwards the API client's log lines through a `Console`-shaped object instead of the client's removed `Logger` interface; what is logged, and at which SDK level, is unchanged. With rc.19, the client returned by `getClient()` no longer has `apiKey`, `userApiKey`, `orgApiKey` or `logger`, and its `baseURL`, `maxRetries`, `timeout` and `logLevel` are read-only: read the keys from `getConfig()`, and derive a client with `withOptions()` to change the others.

### Patch Changes

- 04fdb41: Check a string tool parameter as base64 only when its `contentEncoding` is `base64`. `format: "binary"` (raw octets in OpenAPI) and other encodings such as `base16` were validated as base64, so the Vercel, LangChain, LlamaIndex, and Claude Agent SDK providers rejected tool calls with plain text or hex in those fields, and the schema sent to the model described them as `contentEncoding: "base64"`. Those fields are now plain strings. `contentEncoding: "base64"` keeps its check, and `format: "byte"` stays unchecked.
- be12ce1: Warn once per toolkit version when the API reports it as deprecated through the `Composio-Deprecated-Toolkits` response header. The warning names the version, the sunset date and how to pin a newer version. Silence it with `logLevel: 'error'` or `COMPOSIO_LOG_LEVEL=error`.
- Updated dependencies [f119f05]
- Updated dependencies [04fdb41]
  - @composio/json-schema-to-zod@0.4.0

## 0.25.0

### Minor Changes

- 79c2d1d: Requires `@composio/client` `2.0.0-rc.17`. The SDK now reports itself to the API client through the client's `identity` option instead of default headers. The headers sent with each request are unchanged, with one exception: on Cloudflare Workers and Vercel Edge with Node.js compatibility enabled, `x-client-runtime` now names that runtime instead of `nodejs`, and the polyfilled Node.js version is no longer sent as `x-runtime-version`. A `createSession()` clone no longer copies these headers into its `defaultHeaders`.

  The API client owns these headers, so `defaultHeaders` and `createSession({ headers })` now reject `x-client-provenance`, `x-client-version`, `x-client-library`, `x-client-library-version`, `x-client-language`, `x-client-runtime`, `x-sdk-version`, `x-source`, `x-framework`, `x-runtime` and `x-runtime-version` with a `ComposioError` from `@composio/client`. The SDK used to overwrite such entries silently.

  A custom provider whose `name` cannot be sent as a header value (anything other than printable ASCII with no leading or trailing whitespace) is reported as `unknown` in `x-framework`.

- 40546c3: Add experimental support for tool calls that need the user's approval.

  Sessions accept a `requireApproval` list next to the `toolkits`, `tools` and `tags` filters on `create()` and `update()`. A call to a matching tool doesn't run: `session.execute()` and `session.executeMeta()` throw `ComposioToolInputRequiredError` with the questions on `inputRequests`. To answer, repeat the same call with the user's answers in `inputResponses` and the error's `requestState`:

  ```ts
  const session = await composio.create('user_123', {
    tools: { gmail: { requireApproval: ['GMAIL_SEND_EMAIL'] } },
  });

  try {
    await session.execute('GMAIL_SEND_EMAIL', args);
  } catch (error) {
    if (!(error instanceof ComposioToolInputRequiredError)) throw error;
    const inputResponses = await promptUser(error.inputRequests);
    await session.execute('GMAIL_SEND_EMAIL', args, {
      inputResponses,
      requestState: error.requestState,
    });
  }
  ```

  `promptUser` is a placeholder for your application's consent UI. Display each request, wait for the user's response, and return the answers keyed by request ID. Forward `decline` and `cancel` responses unchanged.

  `experimental.noElicitationSupportFallback` (`'deny'` or `'allow'`) sets what happens to such a call when the session's MCP client can't ask the user.

  `session.executeMeta()` now takes these answers as its third argument, so its request options move to the fourth.

  The Python SDK gains the same `require_approval` lists, `experimental.no_elicitation_support_fallback`, and `input_responses` and `request_state` on `session.execute()` and `session.execute_meta()`.

### Patch Changes

- f9a972b: Update the owned API client to `@composio/client@2.0.0-rc.16`. The SDK's public API and runtime behavior are unchanged.
- 04cd5c4: Fix the trigger subscription lifecycle and contain errors from trigger handlers.

  - `triggers.unsubscribe()` now closes the realtime connection, so a Node process can exit once it has unsubscribed. A later `triggers.subscribe()` opens a new connection.
  - `triggers.unsubscribe()` before any `subscribe()` no longer fetches realtime credentials or creates a client.
  - Concurrent `subscribe()` calls share one connection, and `unsubscribe()` cancels a subscription that is still connecting, so it never opens a connection or delivers events afterwards.
  - A rejected promise from an `async` trigger handler is logged like a synchronous throw instead of escaping as an unhandled rejection that ends the process. Handler failures log the error's message rather than `{}`.

## 0.24.0

### Minor Changes

- 59935c0: Add `session.executeMeta()` to run a Composio meta tool (`COMPOSIO_*`) within a session. It takes a meta tool slug and optional arguments, and returns the same result as `session.execute()`, including `resultType`. Like `session.execute()`, it throws `ComposioToolInputRequiredError` when the tool needs user input and is not retried. The new `ToolRouterSessionMetaToolSlug` type lists the accepted slugs.

  The Python SDK gains the matching `session.execute_meta()` and `ToolRouterSessionMetaToolSlug`.

### Patch Changes

- fd59eba: Update SDK and provider dependencies to compatible releases. Accept Anthropic SDK 0.132 and OpenAI Agents 0.20 in provider peer ranges, and add Pi coding-agent 1.x to the experimental provider's supported peer range.
- 79b4912: Update the owned API client to `@composio/client@2.0.0-rc.14`. OAuth connection data types now accept a `null` `id_token`. Session tag filters accept the `createHint` and `updateHint` tags. The experimental `instant.returnPricesInSearch` Session option returns each Instant tool's price in Session search results, under `toolkitConnectionStatuses[].instantAccount.prices`. `composio.mcp.generate()` now warns once that its URLs rely on the deprecated `include_composio_helper_actions` query parameter; switch to a Session's MCP endpoint.

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
