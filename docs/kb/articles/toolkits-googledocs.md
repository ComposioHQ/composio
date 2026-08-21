Use this guide to create and edit Google Docs content, configure Google OAuth, manage accounts and sessions, and connect through the correct Composio surface.

## Create and edit Google Docs content

**Create documents from Markdown or HTML tables.** `GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN` accepts GitHub-Flavored Markdown. Markdown tables should work, and HTML tables can also be passed in the markdown payload when a table shape is needed.

**Use the tab-aware tools for reading and editing.** Google Docs tab-level access is supported. For reading tabs, use `GOOGLEDOCS_GET_DOCUMENT_BY_ID` or `GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT`. For editing specific tabs, use `GOOGLEDOCS_REPLACE_ALL_TEXT`, `GOOGLEDOCS_REPLACE_IMAGE`, or `GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT`.

## Configure Google OAuth

**Use a customer-owned OAuth2 app.** Create the Google Docs auth config with the customer's Google OAuth app and the
required scopes. The current catalog does not advertise a separate bearer-token
auth scheme for Google Docs. A Composio Project API key authenticates SDK/API
calls to Composio; it is not a replacement for the user's Google OAuth grant.

**Verify sensitive scopes for production use.** Google may block OAuth consent when an app requests unverified sensitive scopes. For production Google Docs/Workspace usage with sensitive scopes, use a verified OAuth app and complete the required Google verification/CASA process where applicable. Without verification, users may see warnings or app-blocked errors.

**Execute through Composio instead of reading provider tokens.** Provider tokens are redacted from connected-account API responses. Use Composio tool execution or Proxy Execute instead of reading access or refresh tokens from connected-account data.

## Manage accounts, sessions, and auth configs

**Select explicitly when a user has multiple Google accounts.** Composio can keep multiple connected accounts for the same toolkit and user. Enable multi-account behavior for the session when needed, give each account a clear alias, and select the intended alias or connected-account ID during execution rather than relying on an implicit default.

**Keep Tool Router v2 accounts under the same user or entity.** Tool Router v2 sessions are scoped to a single `user_id`. Every connected account passed into that session must belong to the same entity, otherwise validation fails with `ToolRouterV2_InvalidConnectedAccountIds`. Reconnect the outlier Google account under the same `user_id` or create a separate session.

**Specify auth config IDs when creating the session.** When creating a Composio session, pass `auth_configs` keyed by toolkit slug, such as `gmail`, `googledrive`, or `googlecalendar`. If specified, Manage Connection uses those auth configs directly instead of picking a default config.

## Connect through Platform or Connect MCP

**Connect the app separately on each surface.** Connections created on Platform (`dashboard.composio.dev`) are isolated from For You / Connect MCP and do not carry over. To use Google Docs/Sheets/Workspace through Connect MCP, ask the MCP server to connect the app from the client flow and complete that OAuth flow.
