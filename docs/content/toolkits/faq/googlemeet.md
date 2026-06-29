## How do I set up custom Google OAuth credentials for Google Meet?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Google Meet?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification. See [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting "Google Meet API has not been used in project" error?

When using custom OAuth credentials, the Google Meet API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.

## Why am I getting "Quota Exhausted" or "rate limit exhausted"?

Google enforces per-minute and daily request quotas. If you're using Composio's default OAuth app, you share that quota with other users, which can cause limits to be hit faster. Use your own OAuth app credentials to get a dedicated quota, and add exponential backoff and retries to handle transient rate limits.

---

## When should I use Google Super tool slugs with a Google Super connected account?

Google Super is a separate toolkit with its own tool slugs. If the connected account was created for Google Super, run the corresponding GOOGLESUPER_* tool, such as GOOGLESUPER_CREATE_MEET, instead of the GOOGLEMEET_* slug. A separate Google Meet auth config or connected account is not required when the workflow is intentionally using Google Super.

## How do I configure Meet scopes and enable the Google Meet API before creating Meet spaces?

For Meet space creation/settings through Google Super, include the Meet scopes https://www.googleapis.com/auth/meetings.space.created and https://www.googleapis.com/auth/meetings.space.settings in the auth config, then initiate a new connection so the new scopes are granted. Also enable the Google Meet API in the Google Cloud Console project backing the OAuth app.

![Google Cloud API Library search results showing the Google Meet REST API result.](/images/kb/toolkits/googlemeet/google-meet-api-library-result.png)

![Google Cloud product details page showing the Enable button for Google Meet REST API.](/images/kb/toolkits/googlemeet/google-meet-api-enable-button.png)

## How should I handle fetch transcript entries by first resolving the conference record?

Start by resolving the conference record, either with GOOGLEMEET_GET_CONFERENCE_RECORD_FOR_MEET when you have the meeting code, or with GOOGLEMEET_LIST_CONFERENCE_RECORDS when listing available records. Use the resulting conferenceRecord_id with GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID, then use the conference record and transcript values to list transcript entries. Prefer GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID over the older/misdescribed GOOGLEMEET_GET_CONFERENCE_TRANSCRIPTS path.

## What does 403 permission errors usually mean the conference resource mean?

For a Google Meet API error like "Permission denied on resource Conference (or it might not exist)", verify that the signed-in connected account has access to the conference/artifact and that the conference record exists. A useful sanity check is to run the official Google Meet API cURL with the connected account access token from the Composio connected account details and compare the provider response with the Composio tool result.

## What does Google Workspace Enterprise mean?

The Google account must be on a Google Workspace Enterprise plan to record meetings. Without meeting recording support on the workspace/account, recordings and related transcripts will not be available through the Google Meet APIs or Composio Google Meet tools.
