---
'@composio/core': patch
---

Sessions now export their MCP config from the auth context the session request was actually made with: the project key as `x-api-key` when one is configured, otherwise the `x-user-api-key` default header, and never any other default header or an ambient `COMPOSIO_API_KEY`. The credential is only attached when the MCP URL shares the origin of the configured API base URL (whatever its scheme); any other destination throws `ComposioMCPDestinationError`, which names both origins and never includes the key. The SDK never connects to the MCP URL itself and does not follow redirects for it. Trigger subscriptions (Pusher channel auth) follow the same rule instead of falling back to the environment when the project key is disabled.

`session.update()` gains `manageConnections.callbackUrl: null` to remove a stored callback URL, keeps an empty toolkit allowlist (`toolkits: []`) in the request so it denies every app toolkit, and accepts an opt-in `expectedConfigVersion` that is sent as the `expected_config_version` precondition. A 409 from the API surfaces as `ComposioSessionConfigConflictError` (re-fetch the session, then retry) and leaves the local session object unchanged; local state is only refreshed after a successful response.
