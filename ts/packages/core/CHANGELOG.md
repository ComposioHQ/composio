# @composio/core

## 0.13.0

### Minor Changes

- d17a268: Add the first-class `composio.sessions.create()` API while keeping `composio.create()` as an alias, expose the experimental shared-connection ACL patch helper as `connectedAccounts.updateAcl()` while keeping `experimental.updateAcl()` as an alias, and include SDK docs/source in the published package.

  **MCP is now opt-in.** Sessions return native tools by default; the hosted MCP endpoint is only surfaced on the type when you create the session with `{ mcp: true }`. The default `create()` / `use()` now return `SessionWithoutMcp` (the runtime object is unchanged — `session.mcp` still exists at runtime — but it is no longer in the type).

  Migration: read `session.mcp` only after creating with `{ mcp: true }`.

- d17a268: Surface the resolved workbench config on Tool Router sessions.

  - `Session.workbench` is now populated from the API response (on create/retrieve/attach/update). It exposes the resolved workbench config, e.g. `session.workbench?.enable` (defaults to `true` server-side).

  This lets callers create a session with the remote workbench disabled (`workbench: { enable: false }`) and detect that state — the foundation for running code in a sandbox you own via the experimental `@composio/experimental/workbench` helpers.

### Patch Changes

- d17a268: Prefer `sandbox` for session code-execution configuration while continuing to accept the existing `workbench` alias.
- d17a268: Add `triggers.parse()` to parse and optionally verify incoming webhook requests.
- d17a268: Add `triggers.setWebhookSubscription()` to create or update the project webhook subscription from the TypeScript SDK.

## 0.12.0

### Minor Changes

- a0bef5d: Bump `@composio/client` to `0.1.0-alpha.74`.
- dfd7a08: Add per-request cancellation to public SDK methods via a new `ComposioRequestOptions` (`{ signal?: AbortSignal }`) trailing argument, plus a typed `ComposioRequestCancelledError` for detecting caller-initiated aborts.

  Without this, a slow `tools.get` or `tools.execute` had no way to be cancelled — a 100s search would block the calling agent indefinitely. The new shape:

  ```typescript
  try {
    const tools = await composio.tools.get(
      'user_1',
      { search: 'send email', limit: 50 },
      { signal: AbortSignal.timeout(5_000) }
    );
  } catch (err) {
    if (err instanceof ComposioRequestCancelledError) {
      return;
    }
    throw err;
  }
  ```

  The signal is forwarded to the underlying `@composio/client` fetch. Any abort error (`APIUserAbortError`, `AbortError`, or `DOMException(name='AbortError')`) coming back is normalized to `ComposioRequestCancelledError` so callers can `instanceof`-detect cancellation without unwrapping nested causes. Catch-and-wrap paths in `tools.execute` / `tools.getRawComposioToolBySlug` / `toolkits.get` re-throw the cancellation error rather than remapping it to `ComposioToolExecutionError` / `ComposioToolNotFoundError` / `ComposioToolkitFetchError`.

  Wired through on:
  - **Tools**: `get`, `getRawComposioTools`, `getRawComposioToolBySlug`, `getRawToolRouterSessionTools`, `execute`, `executeSessionTool`, `getToolsEnum`, `getInput`, `proxyExecute`
  - **Toolkits**: `get`, `listCategories`
  - **AuthConfigs**: `list`, `create`, `get`, `update`, `delete`, `updateStatus`, `enable`, `disable`
  - **ConnectedAccounts**: `list`, `get`, `delete`, `refresh`, `updateStatus`, `enable`, `disable`, `update`
  - **Triggers**: `listActive`, `create`, `update`, `delete`, `enable`, `disable`, `listTypes`, `getType`, `listEnum`
  - **MCP**: `create`, `list`, `get`, `delete`, `update`, `generate`
  - **ToolRouter** (`composio.create` / `composio.use`, `composio.toolRouter.create` / `.use`) — long-running session-creation paths
  - **ToolRouterSession**: `authorize`, `toolkits`, `search`, `execute`, `proxyExecute`, `update`

  ### Custom-tool cooperative cancellation

  Native tool execution is cancelled by the SDK (the underlying `fetch` is aborted). Custom tools are different — the SDK can't preempt user-supplied JavaScript. Two affordances are added so callers get sensible behavior anyway:

  1. **Pre-execute signal check**: if `signal.aborted` is true before the user's `execute` runs, the SDK throws `ComposioRequestCancelledError` and never invokes user code.
  2. **Cooperative signal forwarding**: the same `AbortSignal` is exposed via `SessionContext.signal` for Tool Router custom tools. Long-running implementations can wire `ctx.signal` into their own `fetch` (or any abortable IO) to abort mid-execution; the resulting `AbortError` is normalized to `ComposioRequestCancelledError` by the SDK.

  ```typescript
  import { experimental_createTool } from '@composio/core';

  const longRunningFetch = experimental_createTool('LONG_RUNNING_FETCH', {
    name: 'Long-running fetch',
    description: 'Fetches a URL with cooperative cancellation',
    inputParams: z.object({ url: z.string() }),
    execute: async (input, ctx) => {
      // Pass ctx.signal into fetch so a session.execute(...) abort cancels
      // the in-flight HTTP request mid-flight.
      const resp = await fetch(input.url, { signal: ctx.signal });
      return { result: await resp.json() };
    },
  });
  ```

- 025a657: Drop CommonJS entrypoints and publish the TypeScript SDK packages as ESM-only packages. This is a breaking change within the existing 0.x release line: consumers must use Node.js 22.22.3 or newer. CommonJS callers can only rely on Node's native `require(esm)` interop, and the SDK no longer ships custom CommonJS compatibility machinery or `.cjs` artifacts.
- 4b76dbf: Remove the deprecated `uuid` field from the auth config retrieve/list response type.

  The platform has removed the deprecated V1/V2 UUID-mirror field from V3 API responses (it was a mirror of the canonical nanoid `id`). The SDK no longer reads or re-exposes `uuid` on `AuthConfigRetrieveResponse` (and therefore on the items of `AuthConfigListResponse`).

  This is technically a breaking change to the SDK response type: consumers should use `id` instead of `uuid`. The `expectedInputFields` field is unaffected — it remains a top-level field on the API response.

### Patch Changes

- 552859a: Expose `search` and `showDisabled` filters on `authConfigs.list()`.
- 23f9053: Replace `chalk` with `picocolors` for colored error and log output. The two render identically, but `picocolors` is a fraction of the size (~0.8 kB gzipped vs chalk's much larger footprint), shrinking the bundled package.
- 507318d: Add a provider-agnostic JSON-schema property-key sanitizer: `sanitizeSchemaPropertyKeys(schema, policy)`, `restoreOriginalKeys(value, mapping)`, `mappingHasRenames(mapping)`, and the `KeyMapping` / `KeySanitizationPolicy` types.

  Some providers constrain the characters and length of tool `input_schema` property keys and reject the whole request on a single violation. This utility rewrites offending keys to conforming aliases (recursing through `properties`, array `items`/`prefixItems`, the composition keywords `allOf`/`anyOf`/`oneOf` and `not`/`if`/`then`/`else`, plus `additionalProperties`/`patternProperties`/`$defs`/`contains`) and records a schema-shaped reverse mapping so the original parameter names can be restored before execution. The _constraint_ is injected as a `KeySanitizationPolicy`, so the traversal, collision handling, prototype safety, and depth cap stay provider-agnostic. The `@composio/anthropic` provider now consumes it.

- 6a4cb54: Preserve root `$defs` / `definitions` blocks on tool parameter schemas and dereference them in the Node file modifier, so auto file upload/download detection works when `file_uploadable` or `file_downloadable` is hidden behind an internal `$ref`.
- cbbad15: Improve Zod compatibility at the SDK schema boundary. Custom tools now convert both `zod/v3` and Zod v4 schemas to JSON Schema correctly instead of degrading Zod v4 object schemas to empty schemas. `@composio/core` now exposes `jsonSchemaToZodShape` via `@composio/core/utils/json-schema`, and the Claude Agent SDK provider uses that core subpath instead of converting to a full Zod object and casting `.shape` out of it.
- Updated dependencies [025a657]
  - @composio/json-schema-to-zod@0.2.0

## 0.11.0

### Minor Changes

- a94715f: Forward `userId` when creating trigger instances so trigger 2FA flows can verify connected account ownership.
- 44e5458: Remove the legacy `composio.tools.createCustomTool(...)` in-memory registry API. Use Tool Router custom tools via `experimental_createTool`, `experimental_createToolkit`, and `composio.create(..., { experimental: { customTools, customToolkits } })` instead.

### Patch Changes

- 22a9171: Defer telemetry batch and error sends so instrumentation does not wait for telemetry network requests before returning SDK results or rethrowing SDK errors.
- 93b67e8: Fix automatic file upload/download substitution for file schemas that accept either a single file or a list of files.

  The file modifier now selects composed-schema branches by runtime value shape, so `anyOf(file, array<file>)` uploads or downloads each file when the tool receives a list while preserving existing single-file behavior.

- b69cef1: Tolerate dangling `$ref` pointers in tool schemas the Composio API ships without a matching `$defs` entry. Some toolkits (e.g. `GMAIL_FETCH_EMAILS`) emit `outputParameters` with `"$ref": "#/$defs/FetchEmailsResponse"` while never declaring a top-level `$defs` block. After the strict resolver shipped with the previous Mastra fix, this caused `composio.tools.get(...)` to throw `JsonSchemaRefResolutionError` upfront, making every Gmail / Slack / Google-Calendar tool unusable through `MastraProvider`. The SDK now degrades the unresolvable branch to a permissive object schema and surfaces a single observability warning per `(toolSlug, ref)` pair instead of crashing.
  - `dereferenceJsonSchema` accepts a new optional second argument `{ onUnresolved?: 'throw' | 'sentinel'; onReplace?: (ref, reason) => void }`. Default behavior is unchanged (`'throw'`) — first-party / custom-tool schemas with a typo'd `$ref` still surface as a hard error. Pass `'sentinel'` to replace unresolved branches with the cycle-break sentinel (`{ type: 'object', additionalProperties: true }`) that the resolver already uses for `$ref` cycles. The replaced sentinel carries a default `description` hint so LLMs consuming the wrapped tool's schema get an in-band signal that the branch is opaque; a caller-provided `description` sibling overrides the default (Draft 2020-12 sibling-keyword merge). Safety caps (`MAX_REF_CHAIN_DEPTH`, `MAX_NODE_DEPTH`) keep throwing in both modes. New `UnresolvedRefStrategy`, `UnresolvedRefReason`, and `DereferenceJsonSchemaOptions` type exports.
  - `MastraProvider.wrapTool` opts both `inputParameters` and `outputParameters` into `'sentinel'` mode and emits one `logger.warn` per `(toolSlug, ref)` pair via the provider-scoped dedup `Set`. User-controlled segments in the warning (`tool.slug`, `toolkit.slug`, `ref`) are `JSON.stringify`d to neutralize embedded newlines / ANSI escapes / control bytes that could otherwise forge log lines (CWE-117). A matching one-shot telemetry event (`composio.mastra.wrapTool.danglingRef`) fires next to the warn so the Composio team has aggregate visibility into which toolkits are affected; the event respects `COMPOSIO_DISABLE_TELEMETRY=true`.
  - The `telemetry` instance from `@composio/core` is now publicly re-exported alongside `logger`, so providers can emit aggregate signals without reaching into the package's internals.
  - Resolvable `$defs` / `definitions` continue to be inlined exactly as before — no regression in the type-info preservation contract introduced by the previous Mastra fix.

- 1ba66ca: Fix `tools.execute` (and `tools.get` / `tools.list`) failing with a `ZodError` for every tool from an MCP-backed toolkit (e.g. `granola_mcp`, `apify_mcp`, `tavily_mcp`).

  MCP toolkits don't declare an output schema, and the Composio API serializes that as `output_parameters: {}`. The SDK's `ParametersSchema` required `{ type: 'object', properties: {...} }`, so `transformToolCases` rejected the response and `getRawComposioToolBySlug` — called by `execute` and the list path — threw.

  The SDK now normalizes empty (`{}`), `null`, and missing `input_parameters` / `output_parameters` payloads to `undefined` before validation. `outputParameters` was already declared `.optional()` in the public `Tool` type, so this preserves the contract: "undefined means no declared schema." Tools that _do_ declare a schema continue to be validated strictly.

  No public API change; no toolkit allow-list.

- ce4b213: fix(providers): normalize string tool-call arguments across all providers

  Models occasionally emit tool-call arguments as a JSON string instead of an
  object (most visibly with `COMPOSIO_MULTI_EXECUTE_TOOL` on the Vercel AI SDK),
  which broke downstream validation with errors like
  `tool_use.input: Input should be a valid dictionary`.

  `@composio/core` now exposes a single `normalizeToolArguments` helper, and every
  provider routes model-supplied arguments through it. Object payloads pass
  through unchanged, JSON strings are parsed, empty/`null` payloads become `{}`,
  and anything that cannot resolve to an object throws a typed
  `ComposioInvalidToolArgumentsError` instead of a raw `SyntaxError` or a silently
  forwarded malformed string. This replaces the inconsistent per-provider guards
  that previously existed only in vercel, cloudflare and openai-agents.

## 0.10.0

### Minor Changes

- 42ebff3: feat(connected-accounts): namespace SHARED-connection surface under `experimental`

  Aligns the TypeScript SDK with the experimental wire shape used by Shared Connections. The flat `accountType` / `aclConfigForShared` options on `connectedAccounts.link()` and `session.authorize()` have moved under a single `experimental` block. ACL updates remain on the domain-specific `connectedAccounts.updateAcl()` mount, with `experimental.updateAcl()` kept as an experimental compatibility alias.

  The `experimental` namespace is the signal that the shape may change in future releases. Pinning a SHARED connection in a session config (`connectedAccounts: { gmail: [...] }`) and direct execute by `connectedAccountId` are unchanged — only the connection-create / patch / authorize surfaces are namespaced.

  Also surfaces the `accountType` filter on `connectedAccounts.list()` so SHARED connections can be listed without dropping to the raw client. The wire keeps this as a flat query param, so the SDK keeps it flat too.

  `@composio/client` bumped from `0.1.0-alpha.71` → `0.1.0-alpha.72` so the generated typed client carries the `Experimental` namespaces for `link.create`, `toolRouter.session.link`, and `connectedAccounts.patch`.

  Caller migration:

  ```typescript
  // before
  await composio.connectedAccounts.link('user_id', 'auth_config_id', {
    accountType: 'SHARED',
    aclConfigForShared: { allowAllUsers: true },
  });
  await composio.connectedAccounts.updateAcl('ca_abc', { allowAllUsers: true });
  await session.authorize('github', {
    accountType: 'SHARED',
    aclConfigForShared: { allowAllUsers: true },
  });

  // after
  await composio.connectedAccounts.link('user_id', 'auth_config_id', {
    experimental: {
      accountType: 'SHARED',
      aclConfigForShared: { allowAllUsers: true },
    },
  });
  await composio.connectedAccounts.updateAcl('ca_abc', { allowAllUsers: true });
  await session.authorize('github', {
    experimental: {
      accountType: 'SHARED',
      aclConfigForShared: { allowAllUsers: true },
    },
  });

  // new — list SHARED connections
  const shared = await composio.connectedAccounts.list({
    accountType: 'SHARED',
    userIds: ['user_creator'],
  });
  ```

## 0.9.1

### Patch Changes

- 84a3a07: Add `accountType` and per-user ACL support for SHARED connected accounts.
  - **`accountType` on create**: `composio.connectedAccounts.link(userId, authConfigId, { accountType: 'SHARED' })` creates a SHARED connection. Default remains `PRIVATE`. A SHARED connection can be used by other `userId`s, but only when the connection is explicitly pinned in a tool-router session's config and only when the requesting `userId` passes the connection's ACL.
  - **`accountType` on retrieve**: `get()` and `list()` responses now include `accountType` (`'PRIVATE' | 'SHARED'`).
  - **`aclConfigForShared` on create + retrieve**: per-user ACL block — `{ allowAllUsers, allowedUserIds, notAllowedUserIds }`. On responses the field is `undefined` when the caller isn't authorised to see the ACL, so callers can distinguish _"I can't see the ACL"_ from _"ACL is the default deny-by-default state"_.
  - **`updateAcl()` method** (new): `composio.connectedAccounts.updateAcl(nanoid, { allowAllUsers, allowedUserIds, notAllowedUserIds })` writes the ACL via `PATCH`. PATCH semantics — omit a field to leave it unchanged; pass an empty array to clear an allow/deny list. At least one field required. Calling on a PRIVATE connection raises `ComposioAclOnlyForSharedError` (400).
  - **`ToolRouterSession.authorize()` options gain `accountType` + `aclConfigForShared`**, so a SHARED connection with an ACL can be created in one call from inside a tool-router session.

  ACL resolution rule (deny wins):
  1. requesting `userId` ∈ `notAllowedUserIds` → DENY
  2. `allowAllUsers === true` → ALLOW
  3. requesting `userId` ∈ `allowedUserIds` → ALLOW
  4. otherwise → DENY (deny-by-default)

  Limits: each ACL list accepts up to 1000 entries; each `userId` is 1..256 characters. The SDK enforces these caps at the input boundary.

  New error classes:
  - `ComposioSharedAccessDeniedError` (403) — surfaces from direct `connectedAccountId` execution paths when the requesting user fails the ACL.
  - `ComposioAclOnlyForSharedError` (400) — ACL fields sent on a PRIVATE connection.
  - `ComposioSharedConnectionNotAccessibleError` (400) — tool-router session create / PATCH with a pinned SHARED connection the session user cannot use.

  No breaking changes. Existing `link()` callers without the new options get a `PRIVATE` connection exactly as today; existing `get()` / `list()` callers see new optional fields.

  The Python SDK mirror ships in a separate PR.

- c358ffa: Fix false-positive `initiate()` deprecation warning for custom auth configs (SEC-339 follow-up).

  `composio.connectedAccounts.initiate()` previously emitted a one-time `console.warn` on every redirectable-OAuth response, regardless of whether the auth config was Composio-managed (subject to the 2026-07-03 cutover) or custom (unaffected). The wording was conditional ("If this auth config is Composio-managed…") so callers using their own OAuth apps could ignore it, but the warning still printed and caused noise in logs.

  Apollo already emits the SEC-339 `Deprecation` / `Sunset` / `Link rel="deprecation"` headers (RFC 9745 / RFC 8594) **only** on the retiring branch — managed + redirectable OAuth. The SDK now reads the `Deprecation` header from the response (via `APIPromise.withResponse()`) and gates the warning on its presence. Custom auth configs and non-OAuth schemes get a clean response from the server and now stay silent in the SDK as well.
  - **Behavior change:** No warning is emitted for `initiate()` calls against custom OAuth auth configs or non-OAuth schemes (API key, bearer, basic). Managed-OAuth callers continue to get exactly one warning per process, now with revised wording that points at the response's `Sunset` header for the precise cutover date.
  - **No public API change:** `initiate()` returns the same `ConnectionRequest` shape and respects the same `allowMultiple` guard. `ComposioLegacyConnectedAccountsEndpointRetiredError` continues to surface from the 400 retired-path response.
  - **Test scaffolding:** new mock helper `mockApiPromiseWithHeaders()` in `connectedAccounts.test.ts` wraps a value as an `APIPromise`-shaped thenable so the new tests can simulate apollo's header behavior. Pre-existing initiate tests using `mockResolvedValueOnce` continue to pass via the SDK's defensive fallback when `withResponse` is absent on the mock.

  Python SDK gets the matching change in the same release train.

## 0.9.0

### Minor Changes

- 9f14971: Add migration tooling for the [link auth migration](https://docs.composio.dev/docs/changelog/2026/04/24): callers using `composio.connectedAccounts.initiate()` for Composio-managed auth configs on redirectable OAuth schemes (OAuth1, OAuth2, DCR_OAUTH) now get a typed error and a one-time deprecation warning ahead of the **2026-07-03** all-orgs cutover.
  - **Added:** `ComposioLegacyConnectedAccountsEndpointRetiredError`, exported from `@composio/core`. Thrown by `initiate()` when the underlying `POST /api/v3/connected_accounts` returns a 400 indicating the retiring path. Carries the migration message and a `possibleFixes` block pointing at `link()` and the migration guide.
  - **Added:** one-time-per-process `console.warn` from `initiate()` when the response indicates a redirectable OAuth scheme. Wording is conditional ("If this auth config is Composio-managed…") so callers using custom OAuth apps or non-OAuth schemes can ignore it without ambiguity.
  - **JSDoc:** `initiate()` now flags the retirement explicitly and points at `link()` for the affected combination. Custom auth configs and non-OAuth schemes (API key, bearer, basic) are unaffected.

  No behavior change for any caller outside the Composio-managed-OAuth combination — `initiate()` continues to call the legacy endpoint, return the same `ConnectionRequest` shape, and respect the `allowMultiple` guard.

- 81f8027: Add `session.update()` method for partially updating session configuration after creation. Accepts the same config shape as `create()` and mutates the session in-place. Available in both TypeScript and Python SDKs.
- 711a703: Add expanded ToolRouter session controls for agent workflows. `composio.create()`
  now creates a fresh session on each call for better isolation and observability,
  while `composio.use()` can resume an existing session for multi-turn
  conversations. Sessions can preload frequently used tools, expose custom tools
  directly from `session.tools()`, use a direct-tools preset for agents that know
  their tool set upfront, and update session config mid-session with
  `session.update()`.
- 07c9bab: `connectedAccounts` now accepts both `string` and `string[]` per toolkit.

  A single string is automatically coerced to an array to match the v3.1 API wire format. Existing callers passing `{ gmail: "ca_xxx" }` continue to work without changes. Only one account per toolkit is allowed when multi-account mode is disabled.

- 3ece424: Add custom tools support to `composio.use()`.
  - **`composio.use(id, { customTools, customToolkits })`**: Reuse an existing session and optionally bind SDK-local custom tools for search and execution.
  - **Inline custom tools payload**: `use()` now correctly passes `inlineCustomToolsPayload` and `preloadedCustomToolSlugs` to the session, enabling custom tool execution and preloading on rehydrated sessions.
  - **`CustomToolsMap.tools`**: The map now caches the raw `CustomTool[]` array for future inline re-injection on v3.1 search/execute requests.

### Patch Changes

- c9b6525: Fix `connectedAccounts` TypeScript type so a single `string` per toolkit is actually accepted by the public API.

  Previously the schema's `.transform()` made `ToolRouterCreateSessionConfig['connectedAccounts']` resolve to `Record<string, string[]>` (the post-transform output), so TypeScript users still got `Type 'string' is not assignable to type 'string[]'` even though the runtime accepted strings. Coercion now happens inside `ToolRouter.create`, mirroring the Python implementation, and the public type is `Record<string, string | string[]>`.

- cc673b6: Resolve internal JSON Schema `$ref` pointers (`#/$defs/...` and `#/definitions/...`) before handing tool parameters to `@mastra/schema-compat`. Composio tools whose schemas use `$defs`/`definitions` — legal under Draft 7 and 2020-12 — no longer trigger the AJV `can't resolve reference …` error, and the resolved type information from `$defs` survives the JSON-Schema → Zod → JSON-Schema round-trip instead of being silently degraded to a permissive `anyOf`.
  - New `dereferenceJsonSchema` helper exported from `@composio/core` performs the inline expansion. It deep-clones the input, walks every applicator reflectively (so future JSON Schema keywords are covered), shallow-merges sibling keywords next to `$ref` per Draft 2020-12 semantics, breaks cycles with `{ type: 'object', additionalProperties: true }` (matching the upstream guidance in [mastra-ai/mastra#15341](https://github.com/mastra-ai/mastra/issues/15341)), and strips `$defs`/`definitions` once everything reachable is inlined. External (`http://`/`https://`) `$ref` pointers are left untouched.
  - `@composio/mastra` calls the helper inside `wrapTool` for both `inputParameters` and `outputParameters`.
  - `@mastra/schema-compat` dependency floor raised to `^1.2.9` so users automatically receive [PR #15400](https://github.com/mastra-ai/mastra/pull/15400)'s recursive-`$ref` handling.

- bccd32b: Expose and document the Tool Router direct-tools preset via `SessionPreset.DIRECT_TOOLS`, with Python parity through `SESSION_PRESET_DIRECT_TOOLS`. Direct-tools examples now use the constants and keep the agent prompt generic while still asserting that only direct tools are exposed.
- bccd32b: Document and tighten Tool Router preload behavior for app tools, `preload.tools = "all"`, and SDK custom tools. Custom tool and toolkit preload hints now have clearer user-facing comments, direct custom tool descriptions now only state that search is not needed beforehand, examples assert the normalized `LOCAL_*` tool slugs exposed by `session.tools()`, and `composio.use(..., customTools/customToolkits)` reuses the same custom preload preparation path as session creation.

## 0.8.1

### Patch Changes

- 6b986cd: Bring `connectedAccounts.link()` to parity with `connectedAccounts.initiate()` by adding the `allowMultiple` option and the matching active-connection guard. With customers being migrated off `connected_accounts/create` (initiate) onto `connected_accounts/link` ([SEC-339](https://github.com/ComposioHQ/composio/pull/3274)), the guard moves with them.
  - **Added:** `link(userId, authConfigId, { allowMultiple })`. When `allowMultiple` is `false` (default) and the user already has an `ACTIVE` connection on the auth config, `link()` throws `ComposioMultipleConnectedAccountsError` — same behavior as `initiate()`. Pair with `alias` and a session-level `multiAccount` config to disambiguate at execution time.
  - **Behavior change:** `link()` now performs a `connectedAccounts.list({ userIds, authConfigIds, statuses: ['ACTIVE'] })` pre-flight before calling `client.link.create`. Callers that intentionally create multiple connections per auth config must pass `allowMultiple: true`.

  Python parity: same option (`allow_multiple: bool = False`) and same guard added to `composio.connected_accounts.link()`.

- 1c3276b: Add `workbench.sandboxSize` to the Tool Router session config so callers can pick the workbench sandbox compute tier.
  - **Added:** `workbench.sandboxSize?: 'standard' | 'medium' | 'large' | 'xlarge'` on `ToolRouterCreateSessionConfig`. Forwarded to the API as snake_case `workbench.sandbox_size`. Optional; the server defaults it to `'standard'` (1 vCPU / 1 GB) when omitted, so existing callers keep current behavior.
  - **Added:** `SandboxSize` literal union and `SandboxSizeSchema` zod enum, exported from `@composio/core` so callers can pass tier values without stringly-typing them.
  - **Bumped:** `@composio/client` peer to `0.1.0-alpha.67` to pick up the matching `sandbox_size` field on the Tool Router session params.

  Tiers: `standard` (1 vCPU / 1 GB), `medium` (2 / 2), `large` (4 / 4), `xlarge` (8 / 8). Sandboxes are not billed today; usage-based pricing is planned. See the changelog entry at [`docs/content/changelog/04-28-26-sdk-sandbox-size.mdx`](https://github.com/ComposioHQ/composio/blob/master/docs/content/changelog/04-28-26-sdk-sandbox-size.mdx) for usage and the full tier table.

  Provider packages that depend on `@composio/core` receive automatic patch bumps in the same release train via the changesets `updateInternalDependencies: "patch"` setting — no public-API change in those packages.

## 0.8.0

### Minor Changes

- ebc9778: Make automatic file upload/download opt-in and add scoped allowlist controls.
  - **Removed:** the legacy `autoUploadDownloadFiles` constructor option. Code that sets it must migrate to the new opt-in flag.
  - **Added:** `dangerouslyAllowAutoUploadDownloadFiles` (default `false`). When `true`, the SDK collapses `file_uploadable` schemas to `{ type: 'string', format: 'path' }` for the model and stages local paths/URLs at execute time.
  - **Added:** `fileUploadDirs?: string[] | false` — fail-closed allowlist for local upload paths. `undefined` defaults to `[<home>/.composio/temp]`; `false` rejects all local paths; an explicit `string[]` replaces the default.
  - **Added:** `fileDownloadDir?: string` — directory used to stage S3 downloads on `file_downloadable` results.
  - **Added:** `beforeFileUpload` modifier now receives `source: 'path' | 'url' | 'file'` so hooks can branch on the original input type.
  - **Added:** when auto-upload is **off** but a tool with `file_uploadable` inputs is executed, the SDK emits a one-shot warning per tool slug pointing at `composio.files.upload()` for manual staging.

  See the changelog entry at [`docs/content/changelog/04-24-26-legacy-auto-upload-config-removal.mdx`](https://github.com/ComposioHQ/composio/blob/master/docs/content/changelog/04-24-26-legacy-auto-upload-config-removal.mdx) for migration steps.

  Provider packages that depend on `@composio/core` are bumped to `0.8.0` alongside core in this release train so the version line stays aligned across the monorepo, even though they have no public-API changes of their own.

## 0.6.11

### Patch Changes

- 27ed0c9: **Security:** Harden automatic file uploads by default-blocking local paths under common credential locations (e.g. `.ssh`, `.aws`) and credential-like filenames (e.g. `.env`, default SSH private key names). URLs and `File` objects are unchanged. Opt out with `sensitiveFileUploadProtection: false` only if needed; extend the denylist with `fileUploadPathDenySegments`.

  Adds an optional `beforeFileUpload` hook (e.g. on `composio.tools.get`) to rewrite paths, return `false` to abort, or throw. New errors: `ComposioSensitiveFilePathBlockedError`, `ComposioFileUploadAbortedError`.

## 0.6.10

### Patch Changes

- 670ecc9: Add missing `alias` option to `ToolRouterAuthorizeFn` type. The `ToolRouterSession.authorize()` implementation already accepted `alias`, but the exported type didn't include it, causing type errors when passing `{ alias: 'work-gmail' }` to `session.authorize()`.

## 0.6.9

### Patch Changes

- 5b5723a: release

## 0.6.8

### Patch Changes

- 2b19ae9: Fix `customAuthParams.baseURL` not being sent to the API during tool execution. The SDK property `baseURL` is now correctly mapped to the API's expected `base_url` field.

## 0.6.7

### Patch Changes

- 8dc5568: Add `workbench.enable` option to session config for disabling the workbench entirely. When set to `false`, code execution tools (COMPOSIO_REMOTE_WORKBENCH, COMPOSIO_REMOTE_BASH_TOOL) are excluded from the session. Defaults to `true`.

## 0.6.6

### Patch Changes

- e1f6516: Add custom tool support in Toolrouter

## 0.6.5

### Patch Changes

- 476d451: Add support for files
- Add session file support

## 0.6.5-alpha.0

### Patch Changes

- Add support for files

## 0.6.4

### Patch Changes

- e3f1f6c: Remove telemetry payload

## 0.6.3

### Patch Changes

- 087385d: Remove important tag auto apply when limit is set

## 0.6.2

### Patch Changes

- Updated dependencies [eec8fd9]
  - @composio/json-schema-to-zod@0.1.20

## 0.6.1

### Patch Changes

- e746383: Fix issues with file upload corruption

## 0.6.0

### Minor Changes

- **BREAKING**: Webhook verification now async with new signature
  - `composio.triggers.verifyWebhook()` now requires `await`
  - New required parameters: `id` (webhook-id header) and `timestamp` (webhook-timestamp header)
  - Uses Web Crypto API for Cloudflare Workers compatibility
  - Supports v1, v2, and v3 webhook formats
- **BREAKING**: Mastra provider updated to v1 API
  - Requires Mastra v1 and Node.js v22.13.0+
  - New initialization pattern with Mastra instance
  - E2E tests for Zod v3 and v4 compatibility

- Platform-specific optimizations
  - Separate file tool modifiers for Node.js and Cloudflare Workers
  - Platform-specific config defaults (autoUploadDownloadFiles)
  - Removed node:buffer usage, replaced with Uint8Array
  - Removed node:crypto from triggers for edge runtime support

- Bug fixes
  - Fixed tool fetching with specific version constraints
  - Improved type safety across the SDK

## 0.5.5

### Patch Changes

- b132aad: Update client dependencies and introduce experimentatl tool router features

## 0.5.4

### Patch Changes

- b3f5875: Fix multi connected account flag to check only active accounts

## 0.5.3

### Patch Changes

- 498505d: Fix file upload and download in tools with anyOf schemas

## 0.5.2

### Patch Changes

- 277f02b: Fix bundling issues with external providers

## 0.5.1

### Patch Changes

- 3055048: Update client dependencies and auth config update params to be optional

## 0.5.0

### Minor Changes

- ded64be: Add Cloudflare Workers compatibility for `@composio/core`, tested end-to-end.

## 0.4.0

### Minor Changes

- c7e1217: Add support for dedicated tools for tool router

## 0.3.4

### Patch Changes

- 019f54f: Fix method binding for top level tool router methods

## 0.3.3

### Patch Changes

- a76b002: Add support for enable/disable tags and search toolkits in tool router

## 0.3.2

### Patch Changes

- 69cfede: Update client version and add openWorldHintSupport in toolrouter tag filters. Removes isLocal param in toolkit fetching

## 0.3.1

### Patch Changes

- 73db5f5: Fix callback url not working in toolrouter's session.authorize()

## 0.3.0

### Minor Changes

- 07551cd: Add support for native tool execution in tool router
- 9e002c5: Minor fixes
- f0e67c4: Update API client and tool router types
- 31521bd: Update typedocs and examples for toolkit versions
- 9e002c5: Alpha release of tool router

## 0.2.7-alpha.4

### Patch Changes

- 07551cd: Add support for native tool execution in tool router

## 0.2.7-alpha.3

### Patch Changes

- f0e67c4: Update API client and tool router types

## 0.2.7-alpha.2

### Patch Changes

- 31521bd: Update typedocs and examples for toolkit versions

## 0.2.7-alpha.1

### Patch Changes

- Minor fixes

## 0.2.7-alpha.0

### Patch Changes

- Alpha release of tool router

## 0.2.6

### Patch Changes

- b5cc23f: Fix dangerously skip version check in non agentic providers, Throw error instead of process.exit when api key doesn't exist, bump zod-to-json-schema to 3.25.0, which supports "zod/3"
- Updated dependencies [b5cc23f]
  - @composio/json-schema-to-zod@0.1.19

## 0.2.5

### Patch Changes

- e2762f2: Fix non-agentic providers to work without specifying versions

## 0.2.4

### Patch Changes

- 97c4138: Update composio client version and add support for toolkit version in fetching trigger types

## 0.2.3

### Patch Changes

- f88ab99: Fix: SDK telemetry methods and request headers

## 0.2.2

### Patch Changes

- cfc2c50: Update zod version to 4
- Updated dependencies [cfc2c50]
  - @composio/json-schema-to-zod@0.1.18

## 0.2.1

### Patch Changes

- 6135896: Add toolkit versions support and deprecation flags to TypeScript SDK

  This PR adds support for toolkit versions in the TypeScript SDK and introduces new fields for tracking tool deprecation status and no-auth capabilities.

  ### Core Features
  - **Toolkit Versions Support**:
    - Added `toolkit_versions` parameter to the `Triggers` class, defaulting to `"latest"`
    - Made `Triggers` class generic to accept provider configuration
    - Pass `toolkit_versions` when listing trigger types

  ### New Fields
  - **Tool Types**:
    - Added `isDeprecated` field to track deprecated tools
    - Added `isNoAuth` field to identify tools that support no-auth mode
  - **Trigger Types**:
    - Added `version` field to track trigger versions
  - **Toolkit Metadata**:
    - Added `availableVersions` array to track all available versions

  ### Code Changes
  - Updated `Composio` class to pass config to `Triggers` constructor
  - Updated `Tools.get()` to include new `isDeprecated` and `isNoAuth` fields
  - Updated transformers for toolkits and triggers to handle new fields
  - Added TypeScript types for all new fields

  ### Tests
  - Updated trigger tests to account for `toolkit_versions` and `cursor` parameters
  - Fixed generic type usage in `Triggers` test declarations
  - All 376 tests passing ✅

  ### Dependencies
  - Updated `@composio/client` to version `0.1.0-alpha.38`
  - Updated `pnpm-lock.yaml` with dependency resolution changes

  ## Testing

  ```bash
  pnpm --filter @composio/core test
  ```

  All tests passing (376/376) ✅

  ## Breaking Changes

  None - All changes are backwards compatible with default values

  ## Related Issues

  Fixes toolkit version handling and deprecation flag tracking in TypeScript SDK

## 0.2.0

### Minor Changes

- 157bf7b: ### Added
  - **Version validation for manual tool execution**: Tools now require explicit toolkit version specification when executing manually to prevent unexpected behavior from `latest` version changes
  - **New `dangerously_skip_version_check` parameter** (Python) / `dangerouslySkipVersionCheck` (TypeScript): Optional flag to bypass version validation (use with caution)
  - **`ToolVersionRequiredError` exception** (Python): Raised when attempting to execute tools with `latest` version without skip flag, includes helpful error messages with 4 possible fixes
  - **`ComposioToolVersionRequiredError` error** (TypeScript): Parallel implementation for TypeScript SDK with detailed error context and resolution suggestions
  - **Comprehensive test coverage**: Added 19 new test methods in Python covering all tool execution scenarios including version resolution, error handling, modifiers, and environment variables

  ### Changed
  - **Tool execution behavior**: Manual execution via `tools.execute()` now validates toolkit versions before API calls
  - **Agentic provider flows**: Automatically set `dangerously_skip_version_check=True` internally to maintain backward compatibility for framework integrations
  - **Instance-level version resolution**: Both `execute()` and `_execute_tool()` methods now consistently resolve versions from instance-level `toolkit_versions` configuration
  - **Modifier support**: Added `dangerously_skip_version_check` to modifier parameter types for complete flow coverage
  - **Test version format**: Updated all test files to use production date-based version format (`20251201_XX`) instead of semantic versioning

  ### Fixed
  - **Consistent version handling**: Removed `toolkit_versions` parameter from `_execute_tool()` in favor of instance-level configuration, ensuring consistent version resolution across the SDK
  - **Code formatting**: Applied ruff formatting to all modified Python files
  - **Array parsing to ZodSchema**: Fixes in json-schema-to-zod to parse array without properties and with properties

  ### Migration Guide

  When manually executing tools, you must now specify toolkit versions:

  **Option 1: Pass explicit version parameter**

  ```python
  tools.execute("GITHUB_CREATE_ISSUE",
      arguments={...},
      version="20251201_01"
  )
  ```

  **Option 2: Configure at SDK initialization**

  ```python
  tools = Tools(client, provider,
      toolkit_versions={"github": "20251201_01"}
  )
  ```

  **Option 3: Use environment variables**

  ```bash
  export COMPOSIO_TOOLKIT_VERSION_GITHUB=20251201_01
  ```

  **Option 4: Skip validation (not recommended)**

  ```python
  tools.execute("GITHUB_CREATE_ISSUE",
      arguments={...},
      dangerously_skip_version_check=True
  )
  ```

  ### Developer Notes
  - Agentic framework integrations (LangChain, CrewAI, etc.) are not affected as they automatically use the skip flag
  - The `latest` version can still be used with the skip flag, but specific versions are strongly recommended
  - Error messages include all available resolution options for better developer experience

### Patch Changes

- Updated dependencies [157bf7b]
  - @composio/json-schema-to-zod@0.1.17

## 0.1.55

### Patch Changes

- 8741165: Add zod 4 support via zod/v3 and fix zod schema parsing
- Updated dependencies [8741165]
  - @composio/json-schema-to-zod@0.1.16

## 0.1.54

### Patch Changes

- e5b9db3: Fix exports for experimental tool router

## 0.1.53

### Patch Changes

- 9a1b0e9: - Adds the new experiemntal ToolRouter, Deprecates the existing MCP experience and adds the new MCP components.
  - The old MCP components can be accessed via `deprecated.mcp` until the next release, where it will get removed.
  - Fixes `toolkits.list` and `toolkits.get` methods to add `description` to connection fields

## 0.1.52

### Patch Changes

- 7077cee: Add tool versioning support

## 0.1.51

### Patch Changes

- b9b005a: Add support for composio connect links

## 0.1.50

### Patch Changes

- Updated dependencies [51033d8]
  - @composio/json-schema-to-zod@0.1.15

## 0.1.49

### Patch Changes

- 5027e18: Fix openai responses schema parsing
- Updated dependencies [5027e18]
  - @composio/json-schema-to-zod@0.1.14

## 0.1.48

### Patch Changes

- bb32cc2: Bump openai responses and deprecate openai assistant

## 0.1.47

### Patch Changes

- 05ce9c6: Fix make access token and token type optional in oauth scheme

## 0.1.46

### Patch Changes

- ee12d25: Fix long filenames while uploading files from URL
- 9458513: Feat: Add flags to disable version check

## 0.1.45

### Patch Changes

- Updated dependencies
  - @composio/json-schema-to-zod@0.1.13

## 0.1.44

### Patch Changes

- b4b8b94: Fix telemetry flags and disable when passed

## 0.1.43

### Patch Changes

- eb7691e: Add strict mode to vercel provider

## 0.1.42

### Patch Changes

- Updated dependencies
  - @composio/json-schema-to-zod@0.1.12

## 0.1.41

### Patch Changes

- 025600f: Bump composio client version to 0.1.0-alpha.31

## 0.1.40

### Patch Changes

- 1664c34: Fix auth config creation/updation methods to accept tool access configs

## 0.1.39

### Patch Changes

- Fix jsonSchema to zod parsing which used to eliminate min/max and examples proeperties
- Updated dependencies
  - @composio/json-schema-to-zod@0.1.11

## 0.1.38

### Patch Changes

- 6c980ad: Add generics for CLI trigger type generation

## 0.1.37

### Patch Changes

- 09c4a26: Fix issues with tools.execute requiring userId for no auth apps

## 0.1.36

### Patch Changes

- 7276d1e: Fix issues with json schema to zod parsing causing nested objects to be marked as required
- c223e54: Fix file upload handlers
- 7276d1e: Fix issues with objects with default values being marked as required
- 9a10986: Fix: Relax strict type/schema validations on API responses
- 06612f5: Downgrade chalk to v4 to allow CJS as well
- cb1b401: Update composio api client to latest version
- da57771: dont't validate if authConfigIds is provided
- 91c3647: Update deps
- b001330: Fix package bumps
- 77e96e4: Fix JSON Schema to Zod Parsing
- ea79c18: Bump packages
- cb1b401: Bump packages for authconfig fixes
- ea79c18: Update packages
- a79dfac: Relax connected account schema parsing
- Create stable release
- ea79c18: Fix: Gracefully handle connected account responses for missing fields
- 91c3647: Fix proxy execute params and bump langchain packages
- ea79c18: Bump packages
- Updated dependencies [7276d1e]
- Updated dependencies [7276d1e]
- Updated dependencies [06612f5]
- Updated dependencies [77e96e4]
- Updated dependencies [cb1b401]
- Updated dependencies
  - @composio/json-schema-to-zod@0.1.10

## 0.1.36-next.13

### Patch Changes

- 77e96e4: Fix JSON Schema to Zod Parsing
- Updated dependencies [77e96e4]
  - @composio/json-schema-to-zod@0.1.10-next.5

## 0.1.36-next.12

### Patch Changes

- Update deps

## 0.1.36-next.11

### Patch Changes

- Fix proxy execute params and bump langchain packages

## 0.1.36-next.10

### Patch Changes

- Fix: Relax strict type/schema validations on API responses

## 0.1.36-next.9

### Patch Changes

- 9fa49ec: Update composio api client to latest version
- Bump packages for authconfig fixes
- Updated dependencies
  - @composio/json-schema-to-zod@0.1.10-next.4

## 0.1.36-next.8

### Patch Changes

- Fix package bumps

## 0.1.36-next.7

### Patch Changes

- da57771: dont't validate if authConfigIds is provided

## 0.1.36-next.6

### Patch Changes

- 06612f5: Downgrade chalk to v4 to allow CJS as well
- Relax connected account schema parsing
- Updated dependencies [06612f5]
  - @composio/json-schema-to-zod@0.1.10-next.3

## 0.1.36-next.5

### Patch Changes

- dd630fe: Bump packages
- Bump packages

## 0.1.36-next.4

### Patch Changes

- Update packages

## 0.1.36-next.3

### Patch Changes

- Fix: Gracefully handle connected account responses for missing fields

## 0.1.36-next.2

### Patch Changes

- Fix issues with objects with default values being marked as required
- Updated dependencies
  - @composio/json-schema-to-zod@0.1.10-next.1

## 0.1.36-next.1

### Patch Changes

- Fix issues with json schema to zod parsing causing nested objects to be marked as required
- Updated dependencies
  - @composio/json-schema-to-zod@0.1.10-next.0

## 0.1.36-next.0

### Patch Changes

- Fix file upload handlers

## 0.1.35

### Patch Changes

- git status

## 0.1.34

### Patch Changes

- Add exports for connection request

## 0.1.33

### Patch Changes

- Fix types and exports

## 0.1.32

### Patch Changes

- Add support for File type in uploading files

## 0.1.31

### Patch Changes

- e660385: Fix file upload / download

## 0.1.30

### Patch Changes

- Improved support for file handling

## 0.1.29

### Patch Changes

- Add file upload / download modifiers

## 0.1.28

### Patch Changes

- Add MCP support for providers

## 0.1.27

### Patch Changes

- Remove cusrsor and important flags from tools.get

## 0.1.26

### Patch Changes

- Fix function signatures for toolkits auth fields

## 0.1.25

### Patch Changes

- Add MCP server to composio SDk

## 0.1.24

### Patch Changes

- Fix auth schemes for creating connected accounts

## 0.1.23

### Patch Changes

- Improvements in DX in triggers and bug fixes in tools

## 0.1.22

### Patch Changes

- Adds support for connected accounts allowMultiple flag, and other improvements

## 0.1.21

### Patch Changes

- Add host name support in SDK
- Updated dependencies
  - @composio/json-schema-to-zod@0.1.9

## 0.1.20

### Patch Changes

- 1ab34ef: Fix json schema support in tools
- Updated dependencies [1ab34ef]
  - @composio/json-schema-to-zod@0.1.8

## 0.1.19

### Patch Changes

- c8e89d5: Fix telemetry transport
- Updated dependencies [c8e89d5]
  - @composio/json-schema-to-zod@0.1.7

## 0.1.18

### Patch Changes

- 37a1f01: Feat better connected account creation flow
- Updated dependencies [37a1f01]
  - @composio/json-schema-to-zod@0.1.6

## 0.1.17

### Patch Changes

- df31cc2: Fix json schema parsing
- Updated dependencies [df31cc2]
  - @composio/json-schema-to-zod@0.1.5

## 0.1.16

### Patch Changes

- f943ba4: Export all the types from the core SDK
- Updated dependencies [f943ba4]
  - @composio/json-schema-to-zod@0.1.2

## 0.1.15

### Patch Changes

- 208e320: Update json schema transformations issues related to strict mode
- Updated dependencies [208e320]
  - @composio/json-schema-to-zod@0.1.2

## 0.1.14

### Patch Changes

- 4ddfafc: Add json schema to zod schema
- Updated dependencies [4ddfafc]
  - @composio/json-schema-to-zod@0.1.1

## 0.1.13

### Patch Changes

- 040b5a4: Ability to create sessions for transferring request ids

## 0.1.12

### Patch Changes

- c1443db: Improved error handling and telemetry
- b121e73: Update packages to stable version
- f144202: Update tsdocs across all the functions
- ba8d991: Fix initiate connection flows and api issues
- ca59bcd: Update documentations and fix API discrepencies
- e51680c: Fix versioning with changesets
- 0b15376: Add custom toolkit examples
- de3f522: Stable version with test coverage and other stuff
- a2f9537: Update tools.get to accept discriminated unions
- 83a0d15: Test github ci publish
- eeec413: Rename modifiers, add docs and other miscellanious improvements

## 0.1.12-alpha.16

### Patch Changes

- 0b15376: Add custom toolkit examples

## 0.1.12-alpha.15

### Patch Changes

- f144202: Update tsdocs across all the functions

## 0.1.12-alpha.14

### Patch Changes

- 83a0d15: Test github ci publish

## 0.1.12-alpha.13

### Patch Changes

- a2f9537: Update tools.get to accept discriminated unions

## 0.1.12-alpha.12

### Patch Changes

- de3f522: Stable version with test coverage and other stuff

## 0.1.12-alpha.11

### Patch Changes

- Improved error handling and telemetry

## 0.1.12-alpha.10

### Patch Changes

- eeec413: Rename modifiers, add docs and other miscellanious improvements

## 0.1.12-alpha.9

### Patch Changes

- ba8d991: Fix initiate connection flows and api issues

## 0.1.12-alpha.8

### Patch Changes

- ca59bcd: Update documentations and fix API discrepencies

## 0.1.12-alpha.7

### Patch Changes

- e51680c: Fix versioning with changesets

## 0.1.0

### Patch Changes

- Initial release
