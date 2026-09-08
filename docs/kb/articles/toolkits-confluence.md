Use this guide to configure Confluence OAuth, execute tools with the correct account, and read, update, or download Confluence content.

## Configure Confluence OAuth

**Align custom OAuth scopes with the endpoint type.** For Confluence custom OAuth, keep Atlassian scopes aligned with the scopes Composio expects. Classic and granular scopes differ depending on whether the underlying Confluence endpoint is v1 or v2. Incorrect substitutions such as using an irrelevant space scope can cause tool execution errors even if OAuth completes.

**Add `offline_access` when refresh tokens are needed.** For Confluence OAuth, include the `offline_access` scope in the auth config and then create a new connected account. `offline_access` enables token refresh, and adding it to an existing auth config only affects new connections after users reconnect.

**Use the same redirect URI in Composio and Atlassian.** The redirect URI in the Composio auth config and the Atlassian OAuth app must match. Copy the callback shown by the current auth-config flow or documentation; do not reuse legacy v1 or v3 callback paths from older examples.

## Execute Confluence tools with the correct account

**Pass the connected account ID, not the auth config ID.** For Confluence tool execution, pass the connected account ID. Do not pass the auth config ID/integration ID in the connected account field. Older SDK versions may also require the UUID form rather than the nano ID, so verify the SDK version and expected ID format.

**Read supported scopes from MCP tool annotations.** For supported MCP deployments, Confluence scopes can be retrieved from the `annotations` field in the `listTools` API response.

## Read and update Confluence pages

**Retrieve page content by page ID.** Use `CONFLUENCE_GET_PAGE_BY_ID` to retrieve Confluence page content by page ID. This is the tool support shared for page body retrieval.

**Fetch the latest page version before an update.** Confluence page updates require the correct page version. Pair `CONFLUENCE_UPDATE_PAGE` with `CONFLUENCE_GET_PAGE_VERSIONS` so the agent can fetch the latest required version and then update the page. By default, the agent should update over the latest version unless a specific version is requested.

## Download Confluence attachments

Use `CONFLUENCE_GET_ATTACHMENTS` to list attachments and get the attachment ID, then pass that ID to `CONFLUENCE_DOWNLOAD_ATTACHMENT` to download the file.
