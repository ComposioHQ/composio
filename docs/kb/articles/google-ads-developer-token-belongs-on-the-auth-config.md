Google Ads API requests need both an OAuth access token and a Google Ads developer token. The developer token now belongs on the auth config itself rather than on each connection initiation request.

Auth configs created before this change have no developer token field, and new connections made through them fail because the token is no longer accepted at the connection level.

## Move to a new auth config

1. Create a new Google Ads auth config with the developer token included.
2. Create a fresh connection through that auth config.
3. Retry the failing tool call.

Editing the old auth config is not enough — the connection has to be created through an auth config that carries the token.

For production reliability and isolated provider quota, use your own Google Ads developer token rather than a shared one.
