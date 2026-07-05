## How do I set up custom Google OAuth credentials for Google Docs?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Google Docs?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification. See [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting "Google Docs API has not been used in project" error?

When using custom OAuth credentials, the Google Docs API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.

## Why am I getting "Quota Exhausted" or "rate limit exhausted"?

Google enforces per-minute and daily request quotas. If you're using Composio's default OAuth app, you share that quota with other users, which can cause limits to be hit faster. Use your own OAuth app credentials to get a dedicated quota, and add exponential backoff and retries to handle transient rate limits.

---

## `GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN` accepts GitHub-Flavored Markdown and HTML tables

`GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN` accepts GitHub-Flavored Markdown. Markdown tables should work, and HTML tables can also be passed in the markdown payload when a table shape is needed.

## How do I read and edit Google Docs tabs?

Google Docs tab-level access is supported. For reading tabs, use `GOOGLEDOCS_GET_DOCUMENT_BY_ID` or `GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT`. For editing specific tabs, use `GOOGLEDOCS_REPLACE_ALL_TEXT`, `GOOGLEDOCS_REPLACE_IMAGE`, or `GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT`.

## Does Google Docs support OAuth2 or Bearer auth, with bearer token entry for bearer mode?

For Google Docs, users can choose OAuth2 or Bearer authentication. If using Bearer authentication, enter the bearer token. If using the Composio CLI/environment flow and not logged in, setting `COMPOSIO_API_KEY` in `.env` keeps the session authenticated for toolkit connections.

## Why can Google sensitive scopes cause app-blocked errors?

Google may block OAuth consent when an app requests unverified sensitive scopes. For production Google Docs/Workspace usage with sensitive scopes, use a verified OAuth app and complete the required Google verification/CASA process where applicable. Without verification, users may see warnings or app-blocked errors.

## Why are managed Google OAuth tokens always redacted?

For connections using Composio-managed Google OAuth apps, provider tokens are fully redacted regardless of the project masking setting. To access raw tokens, create a custom auth config with the user's own Google OAuth client credentials; custom auth configs can respect the project masking toggle. Prefer tool execution or Proxy Execute when possible instead of reading tokens directly.

## Multiple Google accounts require multi-account support or distinct connected account/user selection

With the default single-account integration behavior, only one account for the same service may be active at a time. To support multiple Google accounts in parallel, the integration owner must enable/manage multiple connected accounts and select the intended account via `user_id` or `connected_account_id`.

## Tool Router v2 sessions require connected accounts to belong to the same user/entity

Tool Router v2 sessions are scoped to a single `user_id`. Every connected account passed into that session must belong to the same entity, otherwise validation fails with `ToolRouterV2_InvalidConnectedAccountIds`. Reconnect the outlier Google account under the same `user_id` or create a separate session.

## Specify Google auth config IDs at session creation so Manage Connection uses the intended configs

When creating a Composio session, pass `auth_configs` keyed by toolkit slug, such as `gmail`, `googledrive`, or `googlecalendar`. If specified, Manage Connection uses those auth configs directly instead of picking a default config.

## What should I know about Platform connections?

Connections created on Platform (`dashboard.composio.dev`) are isolated from For You / Connect MCP and do not carry over. To use Google Docs/Sheets/Workspace through Connect MCP, ask the MCP server to connect the app from the client flow and complete that OAuth flow.
