---
'@composio/core': minor
---

Expose the rest of the owned client surface on the `Composio` class:

- `composio.webhooks.subscriptions` (`list`, `get`, `set`, `update`, `delete`, `rotateSecret`, `listEventTypes`) and `composio.webhooks.endpoints` (`list`, `get`, `create`, `replace`, `update`). `composio.triggers.setWebhookSubscription()` now delegates to the same upsert as `webhooks.subscriptions.set()`. Its behaviour for well-formed API responses is unchanged; malformed responses are now rejected with a `ValidationError` instead of being read leniently.
- `composio.logs.search()` and `composio.logs.get()` for tool-execution logs.
- `composio.connectedAccounts.revoke()`, which surfaces the API's 400/409 as `ComposioConnectedAccountRevocationNotSupportedError` / `ComposioConnectedAccountNotRevokableError`. `connectedAccounts.refresh()` is marked `@deprecated` (the endpoint is deprecated upstream).
- `composio.toolkits.getMany(slugs)` and `composio.toolkits.changelog()`.
- `session.configHistory()` on sessions.
- `composio.experimental.usage.summary()` and `composio.experimental.usage.breakdown()` (experimental, shape may change).
- `composio.toolkits.recommendScopes(toolkitSlug, { tools, ... })` and `composio.toolkits.listGrantContexts(toolkitSlug)` for OAuth scope recommendations (the API marks both beta).
- `composio.connectedAccounts.completeAuth({ userId, sessionUri })`, which completes a deferred OAuth connection after your OAuth callback verifier has confirmed the user's identity.
- `composio.keyring.listTransferKeys()`, which returns the public JWKs of the organization's customer-managed keyring.
- `composio.experimental.customToolkits` (`upsert`, `sync`, `delete`) for project-owned custom toolkits (in pilot, shape may change).
- `CIMD_OAUTH` joins `AuthSchemeTypes`.
- `triggers.listActive()` returns `{}` for `state` and `triggerConfig` when the API sends `null`.
- `@composio/client` moves to `2.0.0-rc.7`. The API removed `validate_credentials` from the connected-account refresh, so `connectedAccounts.refresh()` now ignores `validateCredentials` and logs a warning when it is set.
- `logger` and `logLevel` options on `new Composio({...})`. `logger` accepts any `{ error, warn, info, debug }` sink (`console`, pino, winston, ...) and receives the SDK's formatted, credential-redacted output; `logLevel` (`'silent' | 'error' | 'warn' | 'info' | 'debug'`) overrides `COMPOSIO_LOG_LEVEL`. The owned client's runtime deprecation warnings (response `Deprecation`/`Sunset` headers and deprecated request inputs) are now routed through that SDK logger instead of `console`. The client's per-request lifecycle logs are emitted only at `'debug'`. `tools.get`/`getRawComposioTools` send the API's `query` parameter in place of the deprecated `search` wire parameter; the SDK's public `search` option is unchanged.
