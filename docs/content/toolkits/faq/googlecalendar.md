## How do I set up custom Google OAuth credentials for Google Calendar?

For a step-by-step guide on creating and configuring your own Google OAuth credentials with Composio, see [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I seeing "App is blocked" when connecting Google Calendar?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification. See [How to create OAuth2 credentials for Google Apps](https://composio.dev/auth/googleapps).

## Why am I getting "Google Calendar API has not been used in project" error?

When using custom OAuth credentials, the Google Calendar API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why was my Google Calendar event created at the wrong time?

When creating or fully updating an event, do not send both an offset-bearing datetime and a separate `timezone` value for the same start or end time. A current Composio timezone-normalization issue can consume the datetime offset and then apply the supplied timezone again, storing the event earlier than requested.

Use one of these input patterns instead:

- For a non-recurring event, use an offset-bearing datetime without `timezone`, for example `2026-08-20T15:00:00+02:00`.
- For a recurring event, or when using an IANA timezone, use a local datetime with `timezone`, for example `2026-08-20T15:00:00` and `Europe/Berlin`.

Read the event back after creating or updating it when the exact stored instant matters. See Google's [event time zone guidance](https://developers.google.com/workspace/calendar/api/concepts/events-calendars#event_time_zone).

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/authentication/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/authentication/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.
