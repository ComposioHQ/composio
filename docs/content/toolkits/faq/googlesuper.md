## How do I set up custom Google OAuth credentials for Google Super?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Google Super?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification. See [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting the "API has not been used in project" error?

When using custom OAuth credentials, the required Google API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/white-labeling-authentication#using-your-own-oauth-apps).

---

## When should I use Google Super?

Google Super is a unified/superset toolkit for Google Workspace services. It can cover tools across Gmail, Google Calendar, Google Meet, and related Google APIs through one Google Super connection when the required scopes are configured.

## What is needed for Google Meet through Google Super?

To use Google Meet tools through Google Super, configure the required Meet scopes in the Google Super auth config, create a new connection for the scope changes to apply, and enable the Google Meet API in Google Cloud Console. Common Meet scopes include `https://www.googleapis.com/auth/meetings.space.created` and `https://www.googleapis.com/auth/meetings.space.settings`.

## Managed Google Super OAuth issues can be unblocked by switching to a custom Google OAuth config

Google Super managed OAuth can be affected independently from other Google managed apps. If managed Google Super OAuth fails with token-exchange 401, `access_denied`, or verification-related errors, use a custom Google OAuth auth config with the user's own credentials and verified scopes.

## Google Super can be narrowed by removing unneeded scopes and tools

Google Super can cover all Google services including Gmail, but users can remove scopes and tools they do not want as part of the Google Super auth/tool configuration. Make sure the remaining scopes still cover the tools the user expects to use.

## What is required for Gmail filter creation through Google Super?

Google Super can cover Gmail workflows through one Google connection, but Gmail filter creation still follows the underlying Gmail API scope requirement. The `users.settings.filters.create` endpoint requires `https://www.googleapis.com/auth/gmail.settings.basic` specifically.

## Google Super Sheets 404s can mean wrong spreadsheet ID, missing access, or missing spreadsheet scope

For Google Super Sheets 404s, first verify the spreadsheet ID, confirm the sheet is shared with the connected Google account, and ensure the connection has `https://www.googleapis.com/auth/spreadsheets`. Reconnect after changing scopes or sharing permissions.

## `Connection initiation did not complete within 10 minutes` means OAuth consent was not completed, not token refresh failure

If expired connections share status reason `Connection initiation did not complete within 10 minutes`, the OAuth flow was initiated but the user did not complete consent within the 10-minute window. No provider tokens were issued in that case, so it is not a 1-2 week refresh token expiry problem.

## Google users can deselect scopes during consent; Composio marks active if token exchange succeeds

Google lets users selectively deselect scopes during consent. Composio marks the connection active as long as token exchange succeeds, even if the final granted scopes are a subset of the auth config's requested scopes. The auth config scopes are the blueprint, but the final permissions are decided by the end user on the consent screen.
