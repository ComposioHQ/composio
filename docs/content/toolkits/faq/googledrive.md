## How do I set up custom Google OAuth credentials for Google Drive?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Google Drive?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification. See [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting "Google Drive API has not been used in project" error?

When using custom OAuth credentials, the Google Drive API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.

---

## Connect MCP exposes a curated Google Drive tool set and discovers the rest through meta-tools

This is expected for Connect MCP. The endpoint exposes a curated direct tool set so the assistant does not load hundreds or thousands of tools into context. Less common or higher-risk Google Drive actions, including `GOOGLEDRIVE_DELETE_FOLDER_OR_FILE` and `GOOGLEDRIVE_EMPTY_TRASH`, are still supported but should be discovered at runtime with `COMPOSIO_SEARCH_TOOLS` and executed with `COMPOSIO_MULTI_EXECUTE_TOOL`.

## Google Drive downloads use temporary presigned URLs with configurable URL TTL and short-lived storage

Downloaded files are staged in temporary S3-backed storage and exposed through presigned URLs. The default presigned URL TTL is 1 hour, and that URL expiration can be customized in Project Settings -> File TTL. The staged files themselves are short lived and are deleted from Composio storage after about 24 hours / one day.

## When should I use custom Google OAuth credentials when managed credentials are not verified for the requested scope?

Google can block the OAuth flow when the OAuth app is not verified for the requested sensitive or restricted scope. If the managed Composio Google OAuth app is not verified for the scope the user needs, create and use custom Google OAuth credentials where that scope is configured and verified on the user's own Google Cloud project. Also verify that the authConfig scopes are the intended custom scopes and not accidentally broader than needed.

## Tool Router v2 sessions require all connected accounts to belong to the same entity

Tool Router v2 sessions are scoped to a single entity/user ID. Every connected account included in a session must belong to that same entity, otherwise validation can fail with `ToolRouterV2_InvalidConnectedAccountIds`. Reconnect Google Drive under the same user/entity as the Gmail and Calendar accounts before combining them in one session. If needed, specify auth config IDs while creating the session so Manage Connection uses the intended auth config for each toolkit.
