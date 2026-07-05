## How do I set up custom Google OAuth credentials for Google Slides?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Google Slides?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification. See [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting "Google Slides API has not been used in project" error?

When using custom OAuth credentials, the Google Slides API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.

## Why am I getting "Quota Exhausted" or "rate limit exhausted"?

Google enforces per-minute and daily request quotas. If you're using Composio's default OAuth app, you share that quota with other users, which can cause limits to be hit faster. Use your own OAuth app credentials to get a dedicated quota, and add exponential backoff and retries to handle transient rate limits.

---

## When should I use Google Drive search to list or discover Google Slides presentations?

Google Slides does not offer a dedicated endpoint to list all presentations through the Slides toolkit. Use `GOOGLEDRIVE_FIND_FILE` and filter Drive files with `q`, for example `mimeType = 'application/vnd.google-apps.presentation'`, then pass the returned presentation ID into the Google Slides tool.

## What is needed for `GOOGLESLIDES_PRESENTATIONS_GET`?

`GOOGLESLIDES_PRESENTATIONS_GET` should be called with the Google Slides presentation ID. Get that ID from the presentation URL, or use the ID returned by `GOOGLEDRIVE_FIND_FILE` when discovering presentations through Drive.

## When should I use the same Google account when pairing Drive discovery with Google Slides reads?

When a workflow discovers presentations with `GOOGLEDRIVE_FIND_FILE` and then reads them with `GOOGLESLIDES_PRESENTATIONS_GET`, make sure the connected Google Drive and Google Slides accounts are the same account. Otherwise the ID may be valid in Drive discovery but inaccessible to the Slides connection.

## `GOOGLEDRIVE_CREATE_FILE_FROM_TEXT` cannot create native Google Slides from text

`GOOGLEDRIVE_CREATE_FILE_FROM_TEXT` cannot create native Google Slides from text because the Google Drive API does not support text-to-slides conversion. Passing `application/vnd.google-apps.presentation` can default to `text/plain`. Drive import supports presentation formats such as Microsoft PowerPoint and OpenDocument Presentation instead.

## What should I know about Google Slides creation tools?

Google Slide creation tools were added to the Google Super toolkit. For slide creation workflows, use the relevant Google Super tools rather than trying to create a native Slides file through generic Drive text upload.

## What must custom Google Slides OAuth apps configure?

When using a custom Google developer app for Google Slides, the app must be verified for the sensitive Google scopes it requests. Without verification, Google may block or warn on the OAuth consent flow.

## Does Google Slides support one trigger in Composio?

Google Slides is listed as a trigger-capable toolkit in Composio with one supported trigger.
