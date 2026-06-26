## Does ClickUp support default auth or your own credentials when creating an integration?

For ClickUp, create an integration/auth config either with Composio's default auth app or with the user's own credentials. In newer SDK/API flows, use the v3 auth config nano ID (`ac_...`) rather than older v1/v2 integration assumptions.

## How should I handle clickUp custom OAuth should use the Composio callback URL registered in the ClickUp app?

For ClickUp custom OAuth, make sure the redirect URL in the ClickUp app matches the Composio callback being used, such as `https://backend.composio.dev/api/v3/toolkits/auth/callback` for v3 or `https://backend.composio.dev/api/v1/auth-apps/add` for older flows. A mismatch between SDK version, auth config ID type, and redirect URL is a common cause of setup failure.

## What should I know about Cursor may fail when too many MCP servers?

If ClickUp MCP fails in Cursor and several MCP servers are configured, reduce the server count or move the ClickUp server into the first few entries. Some MCP clients can behave differently when many servers are configured, so simplifying the client config is a useful isolation step.

## What does ClickUp proxy execute may need?

If ClickUp proxy execution returns `ExternalProxy_OrgNotAllowed`, the org may not have Proxy Execute enabled. Use an API key or scoped key with Proxy Execute permission where available.

## What does ClickUp tokens may require manual provider-side removal if programmatic revocation mean?

For ClickUp, provider-side programmatic token revocation may not be available. If Composio cannot revoke the token through the provider API, the end user should remove the connected app manually from ClickUp/app settings.
