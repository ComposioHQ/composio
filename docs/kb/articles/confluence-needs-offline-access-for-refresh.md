Include the `offline_access` scope in the Confluence auth config, then create a new connected account. `offline_access` is what enables token refresh.

Adding it to an existing auth config only affects connections created afterwards — users on connections made before the change have to reconnect before their tokens can refresh.

## Pass the connected account ID at execution

When executing Confluence tools, pass the connected account ID. Passing the auth config or integration ID in the connected-account field is a common mix-up that fails in ways that look like an auth problem rather than a wrong identifier.
