## How do I set up custom OAuth credentials for Confluence?


For a step-by-step guide on creating and configuring your own Confluence OAuth credentials with Composio, see [How to create OAuth credentials for Confluence](https://composio.dev/auth/confluence).

## What can cause Confluence managed OAuth failures?


If Confluence OAuth fails with the managed app, compare the scopes configured in the auth config with the scopes configured on the Atlassian OAuth app. A mismatch can break connection. Use your own OAuth app with the correct scopes, or replace the auth config scopes with the supported Confluence scope set and reconnect.

## Confluence custom OAuth should keep scopes aligned with Composio defaults and endpoint type


For Confluence custom OAuth, keep Atlassian scopes aligned with the scopes Composio expects. Classic and granular scopes differ depending on whether the underlying Confluence endpoint is v1 or v2. Incorrect substitutions such as using an irrelevant space scope can cause tool execution errors even if OAuth completes.

## When should I add `offline_access` to Confluence auth configs?


For Confluence OAuth, include the `offline_access` scope in the auth config and then create a new connected account. `offline_access` enables token refresh, so adding it to an existing auth config only affects new connections after users reconnect.

## When should I use connected account ID, not auth config ID, when executing Confluence tools?


For Confluence tool execution, pass the connected account ID. Do not pass the auth config ID/integration ID in the connected account field. Older SDK versions may also require the UUID form rather than the nano ID, so verify the SDK version and expected ID format.

## What should I know about Confluence tool scopes?


For supported MCP deployments, scopes can be retrieved from the `annotations` field in the `listTools` API response.

## How should I configure the Atlassian/Confluence OAuth redirect URI?


The redirect URI in the Composio auth config and the Atlassian OAuth app must match. For v3, use `https://backend.composio.dev/api/v3/toolkits/auth/callback` as the callback path. Do not use `https://backend.composio.dev/api/v3/auth-apps/add` for v3 Confluence OAuth.
