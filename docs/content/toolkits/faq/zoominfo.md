## How should I troubleshoot ZoomInfo authentication failures?

For recurring ZoomInfo 401 authentication failures, verify the credential type required by the active ZoomInfo auth config and confirm that the user's ZoomInfo account supports that API authentication method. If the credentials work in ZoomInfo but fail through the toolkit, contact Composio with the connected account ID and tool execution ID.

## What does ZoomInfo require for OAuth credentials?

For ZoomInfo, do not assume a Composio-hosted default OAuth app is available. Some toolkits require the user to provide their own client ID and client secret. If ZoomInfo requests OAuth credentials, configure a ZoomInfo auth config with the user's own OAuth credentials.
