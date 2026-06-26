## What does ZoomInfo authentication mean?

Treat recurring ZoomInfo 401 authentication failures as a toolkit-side auth limitation, not simply a bad user password. The current ZoomInfo toolkit has been using legacy authentication methods that are no longer supported, and Composio has also been blocked on obtaining working ZoomInfo credentials from ZoomInfo. Until the toolkit is revamped and credentials are available, users may continue to see 401s even after a connection is marked connected. Set expectations that the toolkit needs a revamp/credential unblock before this class of failures is resolved.

## What does ZoomInfo require?

For ZoomInfo, do not assume a Composio-hosted default OAuth app is available. Some toolkits do not have a default OAuth app, and ZoomInfo was called out as one where the user needs to provide their own client ID and client secret. If a user asks why ZoomInfo requests OAuth credentials, explain that Composio does not currently provide a default ZoomInfo OAuth app and that the partnerships team is working on getting default OAuth coverage set up.

## When should I use the v3 connected accounts API for BASIC and BASIC_WITH_JWT connection initiation?

When BASIC or BASIC_WITH_JWT connection initiation fails with `Failed to get toolkit by slug, unknown error`, The user should retry after the fix and initiate the connection through the connected accounts API. The reusable v3 shape is `POST https://backend.composio.dev/api/v3/connected_accounts` with `x-api-key`, an `auth_config.id`, and `connection.data` containing the auth fields required by that toolkit plus `connection.user_id`. For BASIC-style apps the data object commonly contains fields such as username, password, and subdomain; for ZoomInfo/BASIC_WITH_JWT, use the required fields returned by that auth config.
