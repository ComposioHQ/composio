## How do I set up custom OAuth credentials for Confluence?

For a step-by-step guide on creating and configuring your own Confluence OAuth credentials with Composio, see [How to create OAuth credentials for Confluence](https://composio.dev/auth/confluence).

## What can cause Confluence managed OAuth failures?

If Confluence OAuth fails with the managed app, compare the scopes configured in the auth config with the scopes configured on the Atlassian OAuth app. A mismatch can break connection. Workarounds are to use a your own OAuth app with the correct scopes, or replace the auth config scopes with the supported Confluence scope set while the managed app is fixed.

## How should I handle confluence custom OAuth should keep scopes aligned with Composio defaults and endpoint type?

For Confluence custom OAuth, keep Atlassian scopes aligned with the scopes Composio expects. Classic and granular scopes differ depending on whether the underlying Confluence endpoint is v1 or v2. Incorrect substitutions such as using an irrelevant space scope can cause tool execution errors even if OAuth completes.

## What should I know about Add `offline_access` to Confluence auth configs when refresh tokens?

For Confluence OAuth, include the `offline_access` scope in the auth config and then create a new connected account. that `offline_access` enables token refresh, so adding it to an existing auth config only affects new connections after users reconnect.

## When should I use connected account ID, not auth config ID, when executing Confluence tools?

For Confluence tool execution, pass the connected account ID. Do not pass the auth config ID/integration ID in the connected account field. Older SDK versions may also require the UUID form rather than the nano ID, so verify the SDK version and expected ID format.

## When should I use `CONFLUENCE_GET_PAGE_BY_ID` to retrieve Confluence page content?

Use `CONFLUENCE_GET_PAGE_BY_ID` to retrieve Confluence page content by page ID. This is the tool for page body retrieval.

## How should I handle `CONFLUENCE_UPDATE_PAGE` should be paired with `CONFLUENCE_GET_PAGE_VERSIONS` for versioned updates?

Confluence page updates require the correct page version. Pair `CONFLUENCE_UPDATE_PAGE` with `CONFLUENCE_GET_PAGE_VERSIONS` so the agent can fetch the latest required version and then update the page. By default, the agent should update over the latest version unless a specific version is requested.

## How should I handle download Confluence attachments by first getting attachment IDs?

Use `CONFLUENCE_GET_ATTACHMENTS` to list attachments and get the attachment ID, then pass that ID to `CONFLUENCE_DOWNLOAD_ATTACHMENT` to download the file.

## What should I know about Confluence tool scopes?

For supported MCP deployments, scopes can be retrieved from the `annotations` field in the `listTools` API response. Confluence as one of the apps where scopes were exposed this way.

## What should I know about Atlassian/Confluence OAuth, use the same redirect URI in auth config and Atlassian app?

The redirect URI in the Composio auth config and the Atlassian OAuth app must match. For v3, `https://backend.composio.dev/api/v3/toolkits/auth/callback` as the correct callback path and noted that `https://backend.composio.dev/api/v3/auth-apps/add` was incorrect.
