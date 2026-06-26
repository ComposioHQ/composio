## What does ZoomInfo authentication mean?

For recurring ZoomInfo 401 authentication failures, verify the credential type required by the active ZoomInfo auth config and confirm that the user's ZoomInfo account supports that API authentication method. If the credentials work in ZoomInfo but fail through the toolkit, contact Composio with the connected account ID and tool execution ID.

## What does ZoomInfo require?

For ZoomInfo, do not assume a Composio-hosted default OAuth app is available. Some toolkits require the user to provide their own client ID and client secret. If ZoomInfo requests OAuth credentials, configure a ZoomInfo auth config with the user's own OAuth credentials.

## When should I use the v3 connected accounts API for BASIC and BASIC_WITH_JWT connection initiation?

For BASIC or BASIC_WITH_JWT connection initiation, use the connected accounts API. The reusable v3 shape is `POST https://backend.composio.dev/api/v3/connected_accounts` with `x-api-key`, an `auth_config.id`, and `connection.data` containing the auth fields required by that toolkit plus `connection.user_id`. For BASIC-style apps the data object commonly contains fields such as username, password, and subdomain; for ZoomInfo/BASIC_WITH_JWT, use the required fields returned by that auth config.
